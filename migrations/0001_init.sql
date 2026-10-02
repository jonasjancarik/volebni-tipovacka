-- A race is anything people can tip: a council (kind 'kv') or a Senate district (kind 'se').
CREATE TABLE races (
  id TEXT PRIMARY KEY,            -- 'kv-554782', 'se-27'
  kind TEXT NOT NULL,
  code INTEGER NOT NULL,          -- KODZASTUP or Senate district number
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  search TEXT NOT NULL,           -- lowercase name without diacritics
  population INTEGER NOT NULL DEFAULT 0,
  seats INTEGER,
  counted_pct REAL,               -- share of polling districts counted
  turnout REAL,
  final INTEGER NOT NULL DEFAULT 0,
  winner INTEGER,                 -- Senate only: elected candidate number
  results_at TEXT
);
CREATE INDEX races_search ON races (kind, search);

CREATE TABLE options (
  race_id TEXT NOT NULL REFERENCES races (id),
  num INTEGER NOT NULL,           -- number on the ballot
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  pct REAL,
  PRIMARY KEY (race_id, num)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
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
  email TEXT NOT NULL,
  nickname TEXT,
  payload TEXT,                   -- tip waiting for e-mail confirmation (JSON)
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX magic_links_email ON magic_links (email, created_at);
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
