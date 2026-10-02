import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { createCipher } from './lib/crypto.js';
import { resolveSecret } from './lib/secrets.js';

// Aplica las migraciones pendientes antes de aceptar tráfico.
const db = await openDatabase({ url: config.databaseUrl, dataDir: config.dataDir });
console.log(config.databaseUrl ? 'Base de datos: PostgreSQL (DATABASE_URL)' : `Base de datos: PGlite en ${config.dataDir}`);
const app = createApp(
  {
    db,
    cipher: createCipher(await resolveSecret(db, 'ENCRYPTION_KEY', config.encryptionKey)),
    jwtSecret: await resolveSecret(db, 'JWT_SECRET', config.jwtSecret),
    secureCookies: config.isProduction,
    fallbackKeys: config.fallbackKeys,
  },
  { webDist: config.webDist },
);

const server = app.listen(config.port, config.host, () => {
  console.log(`Ocryon escuchando en http://${config.host}:${config.port}`);
});

// Parada ordenada (docker stop / redespliegue): termina las peticiones en curso y cierra la base.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
