PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  product_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  current_version TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  entry_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      TEXT    NOT NULL REFERENCES products(product_id),
  subject_key     TEXT    NOT NULL,
  kind            TEXT    NOT NULL CHECK (kind IN ('catalogue','piege','regle')),
  title           TEXT    NOT NULL,
  symptom         TEXT,
  cause           TEXT,
  correction      TEXT    NOT NULL,
  example         TEXT,
  status          TEXT    NOT NULL DEFAULT 'non_teste'
                  CHECK (status IN ('non_teste','valide','a_revoir','archive')),
  product_version TEXT,
  source          TEXT    NOT NULL,
  validated_by    TEXT,
  validated_at    TEXT,
  use_count       INTEGER NOT NULL DEFAULT 0,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  UNIQUE (product_id, subject_key),
  CHECK (status <> 'valide' OR (validated_by IS NOT NULL AND validated_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS entry_terms (
  entry_id INTEGER NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  term     TEXT    NOT NULL COLLATE NOCASE,
  PRIMARY KEY (entry_id, term)
);

CREATE TABLE IF NOT EXISTS identifiers (
  entry_id    INTEGER NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  product_id  TEXT    NOT NULL REFERENCES products(product_id),
  identifier  TEXT    NOT NULL COLLATE NOCASE,
  state       TEXT    NOT NULL CHECK (state IN ('valide','deprecie','inexistant')),
  replaced_by TEXT,
  PRIMARY KEY (entry_id, identifier)
);
CREATE INDEX IF NOT EXISTS identifiers_lookup ON identifiers (product_id, identifier);

CREATE TABLE IF NOT EXISTS lexicon_identifiers (
  product_id TEXT NOT NULL REFERENCES products(product_id),
  identifier TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (product_id, identifier)
);

CREATE TABLE IF NOT EXISTS entry_deps (
  entry_id      INTEGER NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES entries(entry_id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, depends_on_id),
  CHECK (entry_id <> depends_on_id)
);

CREATE TABLE IF NOT EXISTS entry_history (
  entry_id   INTEGER NOT NULL REFERENCES entries(entry_id),
  version    INTEGER NOT NULL,
  snapshot   TEXT    NOT NULL,
  changed_by TEXT    NOT NULL,
  reason     TEXT,
  changed_at TEXT    NOT NULL,
  PRIMARY KEY (entry_id, version)
);

CREATE TABLE IF NOT EXISTS entry_outcomes (
  outcome_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER NOT NULL REFERENCES entries(entry_id),
  outcome    TEXT    NOT NULL CHECK (outcome IN ('ok','ko')),
  note       TEXT,
  actor      TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  CHECK (outcome = 'ok' OR note IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  TEXT NOT NULL REFERENCES products(product_id),
  script_ref  TEXT,
  expected    TEXT NOT NULL,
  observed    TEXT NOT NULL,
  log_excerpt TEXT,
  state       TEXT NOT NULL DEFAULT 'ouvert' CHECK (state IN ('ouvert','traite','rejete')),
  entry_id    INTEGER REFERENCES entries(entry_id),
  created_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title, symptom, cause, correction, terms,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS identifiers_product_check
BEFORE INSERT ON identifiers
WHEN NEW.product_id <> (SELECT product_id FROM entries WHERE entry_id = NEW.entry_id)
BEGIN
  SELECT RAISE(ABORT, 'identifiers.product_id differe de entries.product_id');
END;

CREATE TRIGGER IF NOT EXISTS entries_product_immutable
BEFORE UPDATE OF product_id ON entries
BEGIN
  SELECT RAISE(ABORT, 'entries.product_id est immuable');
END;
