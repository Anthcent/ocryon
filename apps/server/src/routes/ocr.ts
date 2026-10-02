import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';
import { languageCodes } from '../services/languages.js';
import { geminiRecognize } from '../services/ocr/gemini-ocr.js';
import { ocrSpaceRecognize } from '../services/ocr/ocrspace.js';
import { getApiKey, loadSettingsRow } from '../services/settings.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// La imagen se mantiene solo en memoria durante la petición: nunca se escribe en disco.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Formato de imagen no soportado (usa JPG, PNG o WEBP)', 'upload'));
  },
});

const bodySchema = z.object({
  engine: z.enum(['ocrspace', 'gemini']),
  language: z.enum(languageCodes).optional(),
});

export function ocrRouter(ctx: AppContext) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => String(currentUser(req).id),
    message: { error: 'Estás escaneando muy rápido, espera un momento', code: 'rate_limited' },
  });

  router.post('/', limiter, upload.single('image'), async (req, res) => {
    const userId = currentUser(req).id;
    if (!req.file) throw new HttpError(400, 'Falta la imagen', 'upload');
    const { engine, language: requested } = bodySchema.parse(req.body);
    const settings = await loadSettingsRow(ctx, userId);
    const language = requested ?? settings.ocr_language;
    const started = Date.now();

    const text =
      engine === 'ocrspace'
        ? await ocrSpaceRecognize(req.file.buffer, req.file.mimetype, await getApiKey(ctx, userId, 'ocrspace'), language)
        : await geminiRecognize(
            req.file.buffer,
            req.file.mimetype,
            await getApiKey(ctx, userId, 'gemini'),
            settings.gemini_model,
            language,
          );

    res.json({ text, engine, language, ms: Date.now() - started });
  });

  return router;
}
