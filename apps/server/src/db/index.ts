import fs from 'node:fs';
import { PGlite, types as pgliteTypes } from '@electric-sql/pglite';
import pg from 'pg';
import { migrations } from './migrations.js';

/**
 * Acceso a PostgreSQL con una interfaz mínima y asíncrona.
 * - Producción: servidor PostgreSQL real a través de DATABASE_URL (driver `pg`).
 * - Desarrollo y pruebas: PGlite, el mismo PostgreSQL compilado a WebAssembly dentro de Node,
 *   sin instalar nada (funciona igual en Windows, macOS y Linux).
 * Las consultas usan `?` como marcador; aquí se traducen a `$1, $2…`.
 */

export type Row = Record<string, unknown>;
export type Params = unknown[];

export interface Queryable {
  query<T = Row>(sql: string, params?: Params): Promise<T[]>;
  one<T = Row>(sql: string, params?: Params): Promise<T | undefined>;
  /** Ejecuta y devuelve cuántas filas se vieron afectadas. */
  run(sql: string, params?: Params): Promise<number>;
}

export interface Database extends Queryable {
  /** Ejecuta `fn` en una transacción: si lanza un error, se deshace todo. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** «a = ? AND b = ?» → «a = $1 AND b = $2». Nuestras consultas no usan «?» con otro sentido. */
export function toPositional(sql: string) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// Los enteros grandes (COUNT, SUM) y los NUMERIC llegan como número; las fechas, en ISO 8601 (UTC).
const toNumber = (v: string) => Number(v);
const toIso = (v: string) => new Date(v).toISOString();

type Exec = (sql: string, params: Params) => Promise<{ rows: Row[]; affected: number }>;

function queryable(exec: Exec): Queryable {
  return {
    async query<T>(sql: string, params: Params = []) {
      return (await exec(toPositional(sql), params)).rows as T[];
    },
    async one<T>(sql: string, params: Params = []) {
      return (await exec(toPositional(sql), params)).rows[0] as T | undefined;
    },
    async run(sql: string, params: Params = []) {
      return (await exec(toPositional(sql), params)).affected;
    },
  };
}

// --- PostgreSQL (producción) ---
pg.types.setTypeParser(pg.types.builtins.INT8, toNumber);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, toNumber);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, toIso);

function postgres(url: string): Database & { withMigrationLock: (fn: () => Promise<void>) => Promise<void> } {
  // Si la base no responde, falla pronto (el orquestador reinicia el contenedor) en lugar de quedarse colgado.
  const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10_000 });
  // Un cliente inactivo que pierde la conexión no debe tumbar el proceso; el pool lo reemplaza.
  pool.on('error', (err) => console.error('PostgreSQL:', err.message));
  const execOn =
    (client: pg.Pool | pg.PoolClient): Exec =>
    async (sql, params) => {
      const r = await client.query(sql, params);
      return { rows: r.rows, affected: r.rowCount ?? 0 };
    };
  return {
    ...queryable(execOn(pool)),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(queryable(execOn(client)));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
    // Un candado de PostgreSQL evita que dos réplicas apliquen migraciones a la vez.
    async withMigrationLock(fn) {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock(472810391)');
        try {
          await fn();
        } finally {
          await client.query('SELECT pg_advisory_unlock(472810391)');
        }
      } finally {
        client.release();
      }
    },
  };
}

// --- PGlite (desarrollo, pruebas o sin DATABASE_URL) ---
function pglite(dataDir?: string): Database {
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir, {
    parsers: { [pgliteTypes.INT8]: toNumber, [pgliteTypes.NUMERIC]: toNumber, [pgliteTypes.TIMESTAMPTZ]: toIso },
  });
  const execOn =
    (client: Pick<PGlite, 'query'>): Exec =>
    async (sql, params) => {
      const r = await client.query<Row>(sql, params);
      return { rows: r.rows, affected: r.affectedRows ?? 0 };
    };
  return {
    ...queryable(execOn(db)),
    transaction: (fn) => db.transaction((tx) => fn(queryable(execOn(tx)))),
    close: () => db.close(),
  };
}

export interface DatabaseOptions {
  /** Cadena de conexión de PostgreSQL. Si falta, se usa PGlite. */
  url?: string;
  /** Carpeta de datos de PGlite; sin ella, la base vive solo en memoria. */
  dataDir?: string;
}

/** Abre la base de datos y aplica las migraciones pendientes antes de devolverla. */
export async function openDatabase(options: DatabaseOptions): Promise<Database> {
  if (options.url) {
    const db = postgres(options.url);
    await db.withMigrationLock(() => migrate(db));
    return db;
  }
  const db = pglite(options.dataDir);
  await migrate(db);
  return db;
}

/** Aplica, en orden y cada una en su transacción, las migraciones que aún no constan como aplicadas. */
async function migrate(db: Database) {
  await db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const [index, sql] of migrations.entries()) {
    const version = index + 1;
    if (done.has(version)) continue;
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(sql)) await tx.run(statement);
      await tx.run('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    });
  }
}

/** Separa un script en sentencias (las migraciones no contienen «;» dentro de textos ni funciones). */
function splitStatements(sql: string) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}
