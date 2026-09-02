CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY NOT NULL,
  failed_count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at
ON login_attempts(updated_at);
--> statement-breakpoint
PRAGMA optimize;
