/**
 * Copia los datos de la antigua base SQLite (apps/server/data/ocryon.db) a la base actual:
 * PostgreSQL si hay DATABASE_URL, o PGlite en DATA_DIR. Solo funciona sobre una base vacía.
 *
 *   npm run import:sqlite -w @ocryon/server                 (usa la ruta por defecto)
 *   npm run import:sqlite -w @ocryon/server -- ruta/a/ocryon.db
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { openDatabase } from '../db/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] ?? path.resolve(here, '../../data/ocryon.db'));
if (!fs.existsSync(file)) {
  console.error(`No se encontró la base SQLite en ${file}`);
  process.exit(1);
}

// Orden que respeta las claves foráneas.
const TABLES = ['users', 'settings', 'groups', 'scans', 'analyses', 'doc_templates', 'documents'];
const SQLITE_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const source = new DatabaseSync(file, { readOnly: true });
const target = await openDatabase({ url: config.databaseUrl, dataDir: config.dataDir });

try {
  const { n } = (await target.one<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!;
  if (n > 0) throw new Error('La base de destino ya tiene usuarios: la importación solo se hace sobre una base vacía.');

  const existing = new Set(
    (source.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((t) => t.name),
  );
  await target.transaction(async (tx) => {
    for (const table of TABLES) {
      if (!existing.has(table)) continue;
      const columns = new Set(
        (await tx.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = ? AND is_generated = 'NEVER'`,
          [table],
        )).map((c) => c.column_name),
      );
      const rows = source.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const entries = Object.entries(row)
          .filter(([column]) => columns.has(column))
          .map(([column, value]): [string, unknown] => {
            if (column === 'auto_scan') return [column, value === 1];
            // SQLite guardaba las fechas en UTC sin zona horaria.
            if (typeof value === 'string' && SQLITE_DATE.test(value)) return [column, `${value.replace(' ', 'T')}Z`];
            return [column, value];
          });
        await tx.run(
          `INSERT INTO ${table} (${entries.map(([c]) => c).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
          entries.map(([, v]) => v),
        );
      }
      // Que los próximos registros continúen después de los ids importados.
      if (table !== 'settings') {
        await tx.run(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
      }
      console.log(`${table}: ${rows.length}`);
    }
  });
  console.log('Importación completada.');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  source.close();
  await target.close();
}
