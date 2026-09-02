CREATE TABLE IF NOT EXISTS users (
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  cover_object_key TEXT,
  cover_content_type TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE media ADD COLUMN uploader_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE media ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE media ADD COLUMN updated_at INTEGER;
--> statement-breakpoint
UPDATE media SET updated_at = created_at WHERE updated_at IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_users_status_created_at ON users(status, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collections_owner_created_at ON collections(owner_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_media_collection_created_at ON media(collection_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_media_uploader_created_at ON media(uploader_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
--> statement-breakpoint
PRAGMA optimize;
