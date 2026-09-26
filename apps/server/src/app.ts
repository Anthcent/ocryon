import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { AppContext } from './context.js';
import { requireAuth } from './middleware/auth.js';
import { requireCustomHeader } from './middleware/csrf.js';
import { errorHandler } from './middleware/error.js';
import { analysesRouter } from './routes/analyses.js';
import { authRouter } from './routes/auth.js';
import { groupsRouter } from './routes/groups.js';
import { ocrRouter } from './routes/ocr.js';
import { scansRouter } from './routes/scans.js';
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';

export function createApp(ctx: AppContext, options: { webDist?: string } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          // Tesseract.js (servido desde /tesseract) compila su núcleo WebAssembly en el navegador.
          'script-src': ["'self'", "'wasm-unsafe-eval'"],
          'worker-src': ["'self'", 'blob:'],
          'connect-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(requireCustomHeader);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter(ctx));
  api.use(requireAuth(ctx));
  api.use('/settings', settingsRouter(ctx));
  api.use('/ocr', ocrRouter(ctx));
  api.use('/groups', groupsRouter(ctx));
  api.use('/scans', scansRouter(ctx));
  api.use('/search', searchRouter(ctx));
  api.use('/stats', statsRouter(ctx));
  api.use('/analyses', analysesRouter(ctx));
  api.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada', code: 'not_found' }));
  app.use('/api', api);

  // En producción el mismo servidor entrega el frontend compilado.
  const webDist = options.webDist;
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
