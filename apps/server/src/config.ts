import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

function secret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length >= 16) return value;
  if (isProduction) {
    throw new Error(`La variable de entorno ${name} es obligatoria en producción (mínimo 16 caracteres).`);
  }
  return devFallback;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3001),
  /** En contenedores debe ser 0.0.0.0 para aceptar conexiones de fuera del contenedor. */
  host: process.env.HOST ?? '0.0.0.0',
  databasePath: process.env.DATABASE_PATH ?? path.resolve(here, '../data/ocryon.db'),
  jwtSecret: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
  encryptionKey: secret('ENCRYPTION_KEY', 'dev-only-encryption-key-change-me'),
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
