import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

/**
 * SQLite integrado en Node.js (node:sqlite): no requiere compilar módulos nativos,
 * así que `npm install` funciona igual en Windows, macOS y Linux.
 */
export class DB {
  private readonly raw: DatabaseSync;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
  }

  exec(sql: string) {
    this.raw.exec(sql);
  }

  prepare(sql: string) {
    return this.raw.prepare(sql);
  }

  /** Envuelve `fn` en una transacción: si lanza un error, se deshace todo. */
  transaction<T>(fn: () => T): () => T {
    return () => {
      this.raw.exec('BEGIN');
      try {
        const result = fn();
        this.raw.exec('COMMIT');
        return result;
      } catch (err) {
        this.raw.exec('ROLLBACK');
        throw err;
      }
    };
  }

  close() {
    this.raw.close();
  }
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DB(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const pending = migrations.slice(current);
  if (pending.length === 0) return;
  db.transaction(() => {
    for (const sql of pending) db.exec(sql);
    db.exec(`PRAGMA user_version = ${migrations.length}`);
  })();
}
