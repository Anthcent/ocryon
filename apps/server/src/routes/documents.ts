import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppContext } from '../context.js';
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

const DOC_COLUMNS = `id, template_key AS templateKey, template_name AS templateName, title, fields, text, engine, method,
  created_at AS createdAt, updated_at AS updatedAt`;

type DocRow = { fields: string } & Record<string, unknown>;
const parseDoc = (row: DocRow) => ({ ...row, fields: JSON.parse(row.fields) });

const extractSchema = z.object({
  fields: z.array(fieldDef).min(1).max(40),
  text: z.string().min(1, 'No hay texto para analizar').max(200_000),
  documentType: z.string().trim().max(60).default('documento'),
});

export function documentsRouter(ctx: AppContext) {
  const router = Router();

  // --- Tipos de documento propios ---
  router.get('/templates', (req, res) => {
    const rows = ctx.db
      .prepare('SELECT id, name, emoji, fields, created_at AS createdAt FROM doc_templates WHERE user_id = ? ORDER BY name')
      .all(currentUser(req).id) as DocRow[];
    res.json({ templates: rows.map(parseDoc) });
  });

  router.post('/templates', (req, res) => {
    const userId = currentUser(req).id;
    const data = templateSchema.parse(req.body);
    const keys = new Set(data.fields.map((f) => f.key));
    if (keys.size !== data.fields.length) throw new HttpError(400, 'Hay campos repetidos', 'validation');
    const id = Number(
      ctx.db
        .prepare('INSERT INTO doc_templates (user_id, name, emoji, fields) VALUES (?, ?, ?, ?)')
        .run(userId, data.name, data.emoji, JSON.stringify(data.fields)).lastInsertRowid,
    );
    const row = ctx.db.prepare('SELECT id, name, emoji, fields, created_at AS createdAt FROM doc_templates WHERE id = ?').get(id) as DocRow;
    res.status(201).json({ template: parseDoc(row) });
  });

  router.delete('/templates/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const result = ctx.db.prepare('DELETE FROM doc_templates WHERE id = ? AND user_id = ?').run(id, userId);
    if (result.changes === 0) throw notFound('Tipo de documento');
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
      const settings = loadSettingsRow(ctx, userId);
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
        apiKey: getApiKey(ctx, userId, 'gemini'),
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
  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const { template, q } = listSchema.parse(req.query);
    const where: string[] = ['user_id = ?'];
    const params: string[] = [String(userId)];
    if (template) {
      where.push('template_key = ?');
      params.push(template);
    }
    if (q) {
      // Busca en el título, en los valores del formulario y en el texto completo.
      where.push('(title LIKE ? OR fields LIKE ? OR text LIKE ?)');
      const like = `%${q.replace(/[%_]/g, '')}%`;
      params.push(like, like, like);
    }
    const rows = ctx.db
      .prepare(`SELECT ${DOC_COLUMNS} FROM documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 500`)
      .all(...params) as DocRow[];
    const counts = ctx.db
      .prepare('SELECT template_key AS templateKey, COUNT(*) AS count FROM documents WHERE user_id = ? GROUP BY template_key')
      .all(userId);
    res.json({ documents: rows.map(parseDoc), counts });
  });

  router.post('/', (req, res) => {
    const userId = currentUser(req).id;
    const d = documentSchema.parse(req.body);
    const id = Number(
      ctx.db
        .prepare(
          `INSERT INTO documents (user_id, template_key, template_name, title, fields, text, engine, method)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, d.templateKey, d.templateName, d.title, JSON.stringify(d.fields), d.text, d.engine, d.method).lastInsertRowid,
    );
    res.status(201).json({ document: findDoc(userId, id) });
  });

  const findDoc = (userId: number, id: number) => {
    const row = ctx.db.prepare(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = ? AND user_id = ?`).get(id, userId) as DocRow | undefined;
    if (!row) throw notFound('Documento');
    return parseDoc(row);
  };

  router.get('/:id', (req, res) => {
    res.json({ document: findDoc(currentUser(req).id, idParam.parse(req.params.id)) });
  });

  router.patch('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    findDoc(userId, id);
    const data = z.object({ title: documentSchema.shape.title.optional(), fields: documentSchema.shape.fields.optional() }).parse(req.body);
    if (data.title !== undefined) ctx.db.prepare('UPDATE documents SET title = ? WHERE id = ?').run(data.title, id);
    if (data.fields !== undefined) ctx.db.prepare('UPDATE documents SET fields = ? WHERE id = ?').run(JSON.stringify(data.fields), id);
    ctx.db.prepare(`UPDATE documents SET updated_at = datetime('now') WHERE id = ?`).run(id);
    res.json({ document: findDoc(userId, id) });
  });

  router.delete('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    findDoc(userId, id);
    ctx.db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(id, userId);
    res.status(204).end();
  });

  return router;
}
