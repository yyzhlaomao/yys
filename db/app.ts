import { env } from 'cloudflare:workers';

export type UserRole = 'admin' | 'uploader';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type MediaType = 'image' | 'video';

export type UserRecord = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string;
  password_salt: string;
  role: UserRole;
  status: UserStatus;
  application_note: string | null;
  created_at: number;
  approved_at: number | null;
  approved_by: string | null;
  last_login_at: number | null;
};

export type CollectionRecord = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_name: string;
  cover_object_key: string | null;
  cover_content_type: string | null;
  created_at: number;
  updated_at: number;
  media_count: number;
};

export type MediaRecord = {
  id: string;
  object_key: string;
  original_name: string;
  media_type: MediaType;
  content_type: string;
  size: number;
  uploader_id: string | null;
  uploader_name: string | null;
  collection_id: string | null;
  collection_name: string | null;
  created_at: number;
  updated_at: number;
};

let schemaReady: Promise<void> | undefined;

export function getBindings() {
  if (!env.DB || !env.FILES) {
    throw new Error('Cloudflare D1/R2 bindings are unavailable.');
  }
  return { db: env.DB, files: env.FILES, runtime: env };
}

type RuntimeTextBinding =
  | 'ADMIN_SETUP_TOKEN'
  | 'TURNSTILE_SITE_KEY'
  | 'TURNSTILE_SECRET_KEY';

export function getRuntimeText(name: RuntimeTextBinding) {
  const bindingValue = env[name];
  if (typeof bindingValue === 'string' && bindingValue.length > 0) {
    return bindingValue;
  }

  const processValue = process.env[name];
  return typeof processValue === 'string' && processValue.length > 0
    ? processValue
    : undefined;
}

async function addMissingMediaColumns(db: D1Database) {
  const result = await db
    .prepare('PRAGMA table_info(media)')
    .all<{ name: string }>();
  const columns = new Set(result.results.map((column) => column.name));
  const statements: D1PreparedStatement[] = [];

  if (!columns.has('uploader_id')) {
    statements.push(
      db.prepare('ALTER TABLE media ADD COLUMN uploader_id TEXT'),
    );
  }
  if (!columns.has('collection_id')) {
    statements.push(
      db.prepare('ALTER TABLE media ADD COLUMN collection_id TEXT'),
    );
  }
  if (!columns.has('updated_at')) {
    statements.push(
      db.prepare('ALTER TABLE media ADD COLUMN updated_at INTEGER'),
    );
  }
  if (statements.length) await db.batch(statements);
  await db
    .prepare(
      'UPDATE media SET updated_at = created_at WHERE updated_at IS NULL',
    )
    .run();
}

export async function ensureAppSchema() {
  if (!schemaReady) {
    const { db } = getBindings();
    schemaReady = (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'uploader')),
          status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
          application_note TEXT,
          created_at INTEGER NOT NULL,
          approved_at INTEGER,
          approved_by TEXT,
          last_login_at INTEGER
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          last_used_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          owner_id TEXT NOT NULL REFERENCES users(id),
          cover_object_key TEXT,
          cover_content_type TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY NOT NULL,
          object_key TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
          content_type TEXT NOT NULL,
          size INTEGER NOT NULL CHECK (size >= 0),
          uploader_id TEXT REFERENCES users(id),
          collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY NOT NULL,
          actor_user_id TEXT NOT NULL REFERENCES users(id),
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          details TEXT,
          created_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
          attempt_key TEXT PRIMARY KEY NOT NULL,
          failed_count INTEGER NOT NULL,
          window_started_at INTEGER NOT NULL,
          blocked_until INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
      ]);

      await addMissingMediaColumns(db);
      await db.batch([
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)',
        ),
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_users_status_created_at ON users(status, created_at)',
        ),
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_collections_owner_created_at ON collections(owner_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at)',
        ),
        db.prepare(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_media_object_key ON media(object_key)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_media_collection_created_at ON media(collection_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_media_uploader_created_at ON media(uploader_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at ON login_attempts(updated_at)',
        ),
        db.prepare('PRAGMA optimize'),
      ]);
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

export async function listMedia(limit = 300) {
  await ensureAppSchema();
  const { db } = getBindings();
  const result = await db
    .prepare(`SELECT m.id, m.object_key, m.original_name, m.media_type,
      m.content_type, m.size, m.uploader_id, u.display_name AS uploader_name,
      m.collection_id, c.name AS collection_name, m.created_at,
      COALESCE(m.updated_at, m.created_at) AS updated_at
      FROM media m
      LEFT JOIN users u ON u.id = m.uploader_id
      LEFT JOIN collections c ON c.id = m.collection_id
      ORDER BY m.created_at DESC LIMIT ?1`)
    .bind(limit)
    .all<MediaRecord>();
  return result.results;
}

export async function listCollectionMedia(collectionId: string) {
  await ensureAppSchema();
  const { db } = getBindings();
  const result = await db
    .prepare(`SELECT m.id, m.object_key, m.original_name, m.media_type,
      m.content_type, m.size, m.uploader_id, u.display_name AS uploader_name,
      m.collection_id, c.name AS collection_name, m.created_at,
      COALESCE(m.updated_at, m.created_at) AS updated_at
      FROM media m
      LEFT JOIN users u ON u.id = m.uploader_id
      LEFT JOIN collections c ON c.id = m.collection_id
      WHERE m.collection_id = ?1
      ORDER BY m.created_at DESC`)
    .bind(collectionId)
    .all<MediaRecord>();
  return result.results;
}

export async function findMedia(id: string) {
  await ensureAppSchema();
  const { db } = getBindings();
  return db
    .prepare(`SELECT m.id, m.object_key, m.original_name, m.media_type,
      m.content_type, m.size, m.uploader_id, u.display_name AS uploader_name,
      m.collection_id, c.name AS collection_name, m.created_at,
      COALESCE(m.updated_at, m.created_at) AS updated_at
      FROM media m
      LEFT JOIN users u ON u.id = m.uploader_id
      LEFT JOIN collections c ON c.id = m.collection_id
      WHERE m.id = ?1 LIMIT 1`)
    .bind(id)
    .first<MediaRecord>();
}

export async function insertMedia(record: MediaRecord) {
  await ensureAppSchema();
  const { db } = getBindings();
  await db
    .prepare(`INSERT INTO media (
      id, object_key, original_name, media_type, content_type, size,
      uploader_id, collection_id, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(
      record.id,
      record.object_key,
      record.original_name,
      record.media_type,
      record.content_type,
      record.size,
      record.uploader_id,
      record.collection_id,
      record.created_at,
      record.updated_at,
    )
    .run();
}

export async function listCollections(ownerId?: string) {
  await ensureAppSchema();
  const { db } = getBindings();
  const where = ownerId ? 'WHERE c.owner_id = ?1' : '';
  const statement = db.prepare(`SELECT c.id, c.name, c.description, c.owner_id,
    u.display_name AS owner_name, c.cover_object_key, c.cover_content_type,
    c.created_at, c.updated_at, COUNT(m.id) AS media_count
    FROM collections c JOIN users u ON u.id = c.owner_id
    LEFT JOIN media m ON m.collection_id = c.id ${where}
    GROUP BY c.id ORDER BY c.created_at DESC`);
  const result = ownerId
    ? await statement.bind(ownerId).all<CollectionRecord>()
    : await statement.all<CollectionRecord>();
  return result.results;
}

export async function findCollection(id: string) {
  await ensureAppSchema();
  const { db } = getBindings();
  return db
    .prepare(`SELECT c.id, c.name, c.description, c.owner_id,
      u.display_name AS owner_name, c.cover_object_key, c.cover_content_type,
      c.created_at, c.updated_at, COUNT(m.id) AS media_count
      FROM collections c JOIN users u ON u.id = c.owner_id
      LEFT JOIN media m ON m.collection_id = c.id
      WHERE c.id = ?1 GROUP BY c.id LIMIT 1`)
    .bind(id)
    .first<CollectionRecord>();
}
