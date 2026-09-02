import { env } from 'cloudflare:workers';

export type MediaType = 'image' | 'video';

export type MediaRecord = {
  id: string;
  object_key: string;
  original_name: string;
  media_type: MediaType;
  content_type: string;
  size: number;
  created_at: number;
};

let schemaReady: Promise<void> | undefined;

function bindings() {
  if (!env.DB || !env.FILES) {
    throw new Error('Cloudflare D1/R2 bindings are unavailable.');
  }

  return { db: env.DB, files: env.FILES };
}

export function getMediaBindings() {
  return bindings();
}

export async function ensureMediaSchema() {
  if (!schemaReady) {
    const { db } = bindings();
    schemaReady = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY NOT NULL,
          object_key TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
          content_type TEXT NOT NULL,
          size INTEGER NOT NULL CHECK (size >= 0),
          created_at INTEGER NOT NULL
        )`),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at)',
        ),
        db.prepare('PRAGMA optimize'),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }

  await schemaReady;
}

export async function listMedia(limit = 200) {
  await ensureMediaSchema();
  const { db } = bindings();
  const result = await db
    .prepare(`SELECT id, object_key, original_name, media_type, content_type, size, created_at
      FROM media
      ORDER BY created_at DESC
      LIMIT ?1`)
    .bind(limit)
    .all<MediaRecord>();

  return result.results;
}

export async function findMedia(id: string) {
  await ensureMediaSchema();
  const { db } = bindings();
  return db
    .prepare(`SELECT id, object_key, original_name, media_type, content_type, size, created_at
      FROM media
      WHERE id = ?1
      LIMIT 1`)
    .bind(id)
    .first<MediaRecord>();
}

export async function insertMedia(record: MediaRecord) {
  await ensureMediaSchema();
  const { db } = bindings();
  await db
    .prepare(`INSERT INTO media (
      id, object_key, original_name, media_type, content_type, size, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(
      record.id,
      record.object_key,
      record.original_name,
      record.media_type,
      record.content_type,
      record.size,
      record.created_at,
    )
    .run();
}
