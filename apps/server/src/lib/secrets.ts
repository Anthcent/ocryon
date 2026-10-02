import crypto from 'node:crypto';
import type { Database } from '../db/index.js';

/**
 * Devuelve el secreto del entorno o, si no está configurado, uno aleatorio guardado en la base de
 * datos (el mismo para todas las réplicas y entre reinicios). Configurarlo en el entorno sigue
 * siendo lo recomendable: así una copia de la base de datos no incluye la clave de cifrado.
 */
export async function resolveSecret(db: Database, name: string, fromEnv: string | undefined): Promise<string> {
  if (fromEnv) return fromEnv;
  await db.run('INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT (name) DO NOTHING', [
    name,
    crypto.randomBytes(32).toString('hex'),
  ]);
  const row = await db.one<{ value: string }>('SELECT value FROM app_secrets WHERE name = ?', [name]);
  console.warn(`${name} no está configurada: se usa una clave generada y guardada en la base de datos.`);
  return row!.value;
}
