import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { currentUser } from '../middleware/auth.js';
import { geminiGenerate } from '../services/gemini.js';
import { languageCodes } from '../services/languages.js';
import { ocrSpaceRecognize } from '../services/ocr/ocrspace.js';
import { getApiKey, loadSettingsRow, publicSettings } from '../services/settings.js';

// null borra la clave guardada; omitirla la deja como está.
const keyField = z.string().trim().min(8, 'La API key parece incompleta').max(300).nullable().optional();

const updateSchema = z.object({
  defaultEngine: z.enum(['ocrspace', 'gemini', 'tesseract']).optional(),
  ocrLanguage: z.enum(languageCodes).optional(),
  autoScan: z.boolean().optional(),
  geminiModel: z.string().trim().regex(/^[a-z0-9.\-]+$/i, 'Nombre de modelo no válido').max(80).optional(),
  ocrspaceKey: keyField,
  geminiKey: keyField,
});

// PNG 1x1 blanco con texto vacío: suficiente para validar la clave de OCR.space.
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

export function settingsRouter(ctx: AppContext) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await publicSettings(ctx, currentUser(req).id));
  });

  router.put('/', async (req, res) => {
    const userId = currentUser(req).id;
    const data = updateSchema.parse(req.body);
    await loadSettingsRow(ctx, userId);

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };
    if (data.defaultEngine) set('default_engine', data.defaultEngine);
    if (data.ocrLanguage) set('ocr_language', data.ocrLanguage);
    if (data.autoScan !== undefined) set('auto_scan', data.autoScan);
    if (data.geminiModel) set('gemini_model', data.geminiModel);
    if (data.ocrspaceKey !== undefined) set('ocrspace_key_enc', data.ocrspaceKey ? ctx.cipher.encrypt(data.ocrspaceKey) : null);
    if (data.geminiKey !== undefined) set('gemini_key_enc', data.geminiKey ? ctx.cipher.encrypt(data.geminiKey) : null);

    if (sets.length > 0) {
      await ctx.db.run(`UPDATE settings SET ${sets.join(', ')}, updated_at = now() WHERE user_id = ?`, [...values, userId]);
    }
    res.json(await publicSettings(ctx, userId));
  });

  router.post('/test/:provider', async (req, res) => {
    const userId = currentUser(req).id;
    const provider = z.enum(['ocrspace', 'gemini']).parse(req.params.provider);
    const started = Date.now();
    if (provider === 'ocrspace') {
      const row = await loadSettingsRow(ctx, userId);
      await ocrSpaceRecognize(TEST_PNG, 'image/png', await getApiKey(ctx, userId, 'ocrspace'), row.ocr_language).catch((err) => {
        // Una imagen sin texto puede dar error de procesamiento, pero eso prueba que la clave es válida.
        if (err?.code === 'provider_error' && err.status === 422) return '';
        throw err;
      });
    } else {
      const row = await loadSettingsRow(ctx, userId);
      await geminiGenerate({
        apiKey: await getApiKey(ctx, userId, 'gemini'),
        model: row.gemini_model,
        parts: [{ text: 'Responde solo: ok' }],
        timeoutMs: 30_000,
      });
    }
    res.json({ ok: true, ms: Date.now() - started });
  });

  return router;
}
