import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secreto opcional desde el entorno. Si falta, el servidor genera uno aleatorio y lo guarda en la
 * base de datos (ver lib/secrets.ts), así la app arranca aunque no se haya configurado.
 */
function secret(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (value.length < 16) throw new Error(`La variable de entorno ${name} debe tener al menos 16 caracteres.`);
  return value;
}

export const config = {
  isProduction,
  // LISTEN_PORT lo fija la imagen Docker (8080) y tiene prioridad sobre un PORT que inyecte la plataforma.
  port: Number(process.env.LISTEN_PORT ?? process.env.PORT ?? 3001),
  /** En contenedores debe ser 0.0.0.0 para aceptar conexiones de fuera del contenedor. */
  host: process.env.HOST ?? '0.0.0.0',
  /** PostgreSQL de producción. Sin ella se usa PGlite (PostgreSQL embebido) guardado en dataDir. */
  databaseUrl: process.env.DATABASE_URL || undefined,
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../data/pglite'),
  jwtSecret: secret('JWT_SECRET'),
  encryptionKey: secret('ENCRYPTION_KEY'),
  sessionDays: 7,
  /** Intentos de login/registro permitidos por IP cada 15 minutos. */
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 20),
  /** Claves globales opcionales; cada usuario puede configurar las suyas desde Ajustes. */
  fallbackKeys: {
    ocrspace: process.env.OCRSPACE_API_KEY ?? '',
    gemini: process.env.GEMINI_API_KEY ?? '',
  },
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  maxImageBytes: 8 * 1024 * 1024,
};
