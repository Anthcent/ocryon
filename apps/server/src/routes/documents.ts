import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { fold, foldSql } from '../lib/fold.js';
import { HttpError, notFound } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';
import { geminiGenerate } from '../services/gemini.js';
import { getApiKey, loadSettingsRow } from '../services/settings.js';

export const FIELD_TYPES = ['text', 'number', 'money', 'date', 'id', 'email', 'phone', 'longtext'] as const;

const fieldDef = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, 'Clave de campo no válida'),
  label: z.string().trim().min(1, 'Cada campo necesita un nombre').max(60),
  type: z.enum(FIELD_TYPES),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, 'El tipo necesita un nombre').max(60),
  emoji: z.string().trim().max(8).default('📄'),
  fields: z.array(fieldDef).min(1, 'Añade al menos un campo').max(40),
});

const fieldValue = fieldDef.extend({ value: z.string().max(5000) });

const documentSchema = z.object({
  templateKey: z.string().trim().min(1).max(60),
  templateName: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1, 'El documento necesita un título').max(200),
  fields: z.array(fieldValue).max(40),
  text: z.string().max(500_000).default(''),
  engine: z.enum(['ocrspace', 'gemini', 'tesseract', 'manual']).default('manual'),
  method: z.enum(['ai', 'rules', 'manual']).default('manual'),
});

const listSchema = z.object({
  template: z.string().trim().max(60).optional(),
  q: z.string().trim().max(200).optional(),
});

const idParam = z.coerce.number().int().positive();

const DOC_COLUMNS = `id, template_key AS "templateKey", template_name AS "templateName", title, fields, text, engine, method,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const TEMPLATE_COLUMNS = `id, name, emoji, fields, created_at AS "createdAt"`;

type DocRow = { fields: string; title?: string } & Record<string, unknown>;
const parseDoc = (row: DocRow) => ({ ...row, fields: JSON.parse(row.fields) });

const extractSchema = z.object({
  fields: z.array(fieldDef).min(1).max(40),
  text: z.string().min(1, 'No hay texto para analizar').max(200_000),
  documentType: z.string().trim().max(60).default('documento'),
});

export function documentsRouter(ctx: AppContext) {
  const router = Router();

  // --- Tipos de documento propios ---
  router.get('/templates', async (req, res) => {
    const rows = await ctx.db.query<DocRow>(`SELECT ${TEMPLATE_COLUMNS} FROM doc_templates WHERE user_id = ? ORDER BY name, id`, [
      currentUser(req).id,
    ]);
    res.json({ templates: rows.map(parseDoc) });
  });

  router.post('/templates', async (req, res) => {
    const userId = currentUser(req).id;
    const data = templateSchema.parse(req.body);
    const keys = new Set(data.fields.map((f) => f.key));
    if (keys.size !== data.fields.length) throw new HttpError(400, 'Hay campos repetidos', 'validation');
    const row = await ctx.db.one<DocRow>(
      `INSERT INTO doc_templates (user_id, name, emoji, fields) VALUES (?, ?, ?, ?) RETURNING ${TEMPLATE_COLUMNS}`,
      [userId, data.name, data.emoji, JSON.stringify(data.fields)],
    );
    res.status(201).json({ template: parseDoc(row!) });
  });

  router.delete('/templates/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const deleted = await ctx.db.run('DELETE FROM doc_templates WHERE id = ? AND user_id = ?', [id, userId]);
    if (deleted === 0) throw notFound('Tipo de documento');
    res.status(204).end();
  });

  // --- Extracción de datos con IA (Gemini) a partir del texto OCR ---
  router.post(
    '/extract',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 30,
      keyGenerator: (req) => String(currentUser(req).id),
      message: { error: 'Demasiadas extracciones seguidas, espera un momento', code: 'rate_limited' },
    }),
    async (req, res) => {
      const userId = currentUser(req).id;
      const { fields, text, documentType } = extractSchema.parse(req.body);
      const settings = await loadSettingsRow(ctx, userId);
      const properties = Object.fromEntries(fields.map((f) => [f.key, { type: 'STRING', description: f.label }]));
      const prompt = [
        `Extrae los datos de este ${documentType} a partir de su texto obtenido por OCR.`,
        'Devuelve cada campo tal como aparece en el documento. Si un dato no aparece, devuelve una cadena vacía.',
        'Formatos: fechas como AAAA-MM-DD; importes solo con números y punto decimal (sin símbolo de moneda).',
        'Campos:',
        ...fields.map((f) => `- ${f.key}: ${f.label} (${f.type})`),
        '',
        '--- TEXTO ---',
        text,
      ].join('\n');
      const raw = await geminiGenerate({
        apiKey: await getApiKey(ctx, userId, 'gemini'),
        model: settings.gemini_model,
        parts: [{ text: prompt }],
        responseSchema: { type: 'OBJECT', properties, required: fields.map((f) => f.key) },
      });
      let values: Record<string, unknown>;
      try {
        values = JSON.parse(raw);
      } catch {
        throw new HttpError(502, 'Gemini devolvió una respuesta incompleta, inténtalo de nuevo', 'provider_error');
      }
      res.json({ values: Object.fromEntries(fields.map((f) => [f.key, String(values[f.key] ?? '').trim()])) });
    },
  );

  // --- Documentos ---
  const findDoc = async (userId: number, id: number) => {
    const row = await ctx.db.one<DocRow>(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!row) throw notFound('Documento');
    return parseDoc(row);
  };

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const { template, q } = listSchema.parse(req.query);
    const where: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];
    if (template) {
      where.push('template_key = ?');
      params.push(template);
    }
    const words = q ? (fold(q).match(/[\p{L}\p{N}@._-]+/gu) ?? []).slice(0, 8) : [];
    for (const word of words) {
      // Cada palabra debe aparecer en el título, en los valores del formulario o en el texto, sin importar acentos.
      where.push(`${foldSql("title || ' ' || fields || ' ' || text")} LIKE ?`);
      params.push(`%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    const rows = await ctx.db.query<DocRow>(
      `SELECT ${DOC_COLUMNS} FROM documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 500`,
      params,
    );
    const counts = await ctx.db.query(
      'SELECT template_key AS "templateKey", COUNT(*) AS count FROM documents WHERE user_id = ? GROUP BY template_key',
      [userId],
    );
    res.json({ documents: rows.map(parseDoc), counts });
  });

  router.post('/', async (req, res) => {
    const userId = currentUser(req).id;
    const d = documentSchema.parse(req.body);
    const row = await ctx.db.one<DocRow>(
      `INSERT INTO documents (user_id, template_key, template_name, title, fields, text, engine, method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${DOC_COLUMNS}`,
      [userId, d.templateKey, d.templateName, d.title, JSON.stringify(d.fields), d.text, d.engine, d.method],
    );
    res.status(201).json({ document: parseDoc(row!) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ document: await findDoc(currentUser(req).id, idParam.parse(req.params.id)) });
  });

  router.patch('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const current = await findDoc(userId, id);
    const data = z.object({ title: documentSchema.shape.title.optional(), fields: documentSchema.shape.fields.optional() }).parse(req.body);
    await ctx.db.run('UPDATE documents SET title = ?, fields = ?, updated_at = now() WHERE id = ? AND user_id = ?', [
      data.title ?? current.title,
      JSON.stringify(data.fields ?? current.fields),
      id,
      userId,
    ]);
    res.json({ document: await findDoc(userId, id) });
  });

  router.delete('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await findDoc(userId, id);
    await ctx.db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', [id, userId]);
    res.status(204).end();
  });

  return router;
}
