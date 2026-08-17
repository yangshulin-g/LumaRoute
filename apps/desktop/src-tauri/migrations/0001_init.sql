CREATE TABLE IF NOT EXISTS server_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('emby', 'jellyfin')),
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  credential_key TEXT NOT NULL UNIQUE,
  preferred_line_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_lines (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES server_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  priority INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE(profile_id, base_url)
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL
);

PRAGMA user_version = 1;
