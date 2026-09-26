/**
 * Migraciones en orden. Nunca modifiques una ya publicada: añade una nueva al final.
 * La versión aplicada se guarda en PRAGMA user_version.
 */
export const migrations: string[] = [
  /* sql */ `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE settings (
    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_engine    TEXT NOT NULL DEFAULT 'ocrspace',
    ocr_language      TEXT NOT NULL DEFAULT 'spa',
    auto_scan         INTEGER NOT NULL DEFAULT 0,
    gemini_model      TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    ocrspace_key_enc  TEXT,
    gemini_key_enc    TEXT,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT 'green',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_groups_user ON groups(user_id, updated_at DESC);

  CREATE TABLE scans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL DEFAULT 0,
    title       TEXT NOT NULL DEFAULT '',
    text        TEXT NOT NULL DEFAULT '',
    engine      TEXT NOT NULL,
    language    TEXT NOT NULL DEFAULT 'spa',
    word_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_scans_user ON scans(user_id, created_at DESC);
  CREATE INDEX idx_scans_group ON scans(group_id, position);

  CREATE VIRTUAL TABLE scans_fts USING fts5(
    title, text,
    content='scans', content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER scans_ai AFTER INSERT ON scans BEGIN
    INSERT INTO scans_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
  END;
  CREATE TRIGGER scans_ad AFTER DELETE ON scans BEGIN
    INSERT INTO scans_fts(scans_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
  END;
  CREATE TRIGGER scans_au AFTER UPDATE OF title, text ON scans BEGIN
    INSERT INTO scans_fts(scans_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
    INSERT INTO scans_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
  END;

  CREATE TABLE analyses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('group', 'scan')),
    target_id   INTEGER NOT NULL,
    mode        TEXT NOT NULL CHECK (mode IN ('online', 'offline')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_analyses_target ON analyses(user_id, target_type, target_id, created_at DESC);
  `,
];
