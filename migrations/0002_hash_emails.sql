-- E-mail addresses are no longer stored. Accounts and confirmation links keep only a keyed hash
-- (HMAC-SHA256 with EMAIL_HASH_KEY), which is enough to recognise a returning address at sign-in.
-- Run before launch: existing accounts and tips cannot be carried over, so they are dropped.
DROP TABLE tips;
DROP TABLE sessions;
DROP TABLE magic_links;
DROP TABLE users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  expires_at TEXT NOT NULL
);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  nickname TEXT,
  payload TEXT,                   -- tip waiting for e-mail confirmation (JSON)
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX magic_links_email ON magic_links (email_hash, created_at);
CREATE INDEX magic_links_ip ON magic_links (ip_hash, created_at);

CREATE TABLE tips (
  user_id INTEGER NOT NULL REFERENCES users (id),
  race_id TEXT NOT NULL REFERENCES races (id),
  turnout REAL NOT NULL,
  shares TEXT NOT NULL,           -- JSON {"<num>": pct}
  winner INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, race_id)
);
CREATE INDEX tips_race ON tips (race_id);
