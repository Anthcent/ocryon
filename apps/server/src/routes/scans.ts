import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { HttpError, notFound } from '../lib/http-error.js';
import { countWords } from '../lib/text.js';
import { currentUser } from '../middleware/auth.js';
import { languageCodes } from '../services/languages.js';
import { groupSchema } from './groups.js';

const MAX_TEXT = 500_000;

const itemSchema = z.object({
  title: z.string().trim().max(200).default(''),
  text: z.string().max(MAX_TEXT, 'El texto es demasiado largo'),
  engine: z.enum(['ocrspace', 'gemini', 'tesseract', 'manual']),
  language: z.enum(languageCodes).default('spa'),
  /** Número de página impreso en la hoja, si se detectó (p. ej. «23» o «xii»). */
  pageLabel: z.string().trim().max(20).default(''),
});

const createSchema = z
  .object({
    groupId: z.number().int().positive().optional(),
    newGroup: groupSchema.optional(),
    items: z.array(itemSchema).min(1, 'No hay escaneos para guardar').max(500),
  })
  .refine((d) => !(d.groupId && d.newGroup), 'Elige un grupo existente o uno nuevo, no ambos');

const updateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  text: z.string().max(MAX_TEXT).optional(),
  groupId: z.number().int().positive().nullable().optional(),
  pageLabel: z.string().trim().max(20).optional(),
});

const listSchema = z.object({
  scope: z.enum(['all', 'individual']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParam = z.coerce.number().int().positive();

const SCAN_COLUMNS = `s.id, s.group_id AS groupId, s.title, s.text, s.engine, s.language, s.position,
  s.word_count AS wordCount, s.page_label AS pageLabel, s.created_at AS createdAt, s.updated_at AS updatedAt`;

export function scansRouter(ctx: AppContext) {
  const router = Router();

  const assertGroup = (userId: number, groupId: number) => {
    const ok = ctx.db.prepare('SELECT 1 FROM groups WHERE id = ? AND user_id = ?').get(groupId, userId);
    if (!ok) throw notFound('Grupo');
  };

  const findScan = (userId: number, id: number) => {
    const scan = ctx.db
      .prepare(
        `SELECT ${SCAN_COLUMNS}, g.title AS groupTitle, g.color AS groupColor
           FROM scans s LEFT JOIN groups g ON g.id = s.group_id
          WHERE s.id = ? AND s.user_id = ?`,
      )
      .get(id, userId);
    if (!scan) throw notFound('Escaneo');
    return scan as Record<string, unknown>;
  };

  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const q = listSchema.parse(req.query);
    const where = q.scope === 'individual' ? 'AND s.group_id IS NULL' : '';
    const scans = ctx.db
      .prepare(
        `SELECT ${SCAN_COLUMNS}, g.title AS groupTitle, g.color AS groupColor
           FROM scans s LEFT JOIN groups g ON g.id = s.group_id
          WHERE s.user_id = ? ${where}
          ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      )
      .all(userId, q.limit, q.offset);
    const { total } = ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM scans s WHERE s.user_id = ? ${where}`)
      .get(userId) as { total: number };
    res.json({ scans, total });
  });

  /** Guarda uno o varios escaneos, individuales o dentro de un grupo (existente o nuevo). */
  router.post('/', (req, res) => {
    const userId = currentUser(req).id;
    const data = createSchema.parse(req.body);

    const result = ctx.db.transaction(() => {
      let groupId: number | null = null;
      if (data.newGroup) {
        const g = data.newGroup;
        groupId = Number(
          ctx.db
            .prepare('INSERT INTO groups (user_id, title, description, author, category, color, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(userId, g.title, g.description, g.author, g.category, g.color, g.totalPages).lastInsertRowid,
        );
      } else if (data.groupId) {
        assertGroup(userId, data.groupId);
        groupId = data.groupId;
      }

      let position = 0;
      if (groupId) {
        const row = ctx.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM scans WHERE group_id = ?').get(groupId) as { next: number };
        position = row.next;
        ctx.db.prepare(`UPDATE groups SET updated_at = datetime('now') WHERE id = ?`).run(groupId);
      }

      const insert = ctx.db.prepare(
        `INSERT INTO scans (user_id, group_id, position, title, text, engine, language, word_count, page_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const ids = data.items.map((item, i) => {
        const title = item.title || (groupId ? `Página ${position + i + 1}` : defaultTitle(item.text));
        return Number(
          insert.run(userId, groupId, position + i, title, item.text, item.engine, item.language, countWords(item.text), item.pageLabel)
            .lastInsertRowid,
        );
      });
      return { groupId, ids };
    })();

    res.status(201).json(result);
  });

  router.get('/:id', (req, res) => {
    res.json({ scan: findScan(currentUser(req).id, idParam.parse(req.params.id)) });
  });

  router.patch('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const current = findScan(userId, id);
    const data = updateSchema.parse(req.body);

    let groupId = current.groupId as number | null;
    let position = current.position as number;
    if (data.groupId !== undefined && data.groupId !== groupId) {
      if (data.groupId !== null) {
        assertGroup(userId, data.groupId);
        position = (ctx.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM scans WHERE group_id = ?').get(data.groupId) as { next: number }).next;
      }
      groupId = data.groupId;
    }
    const text = data.text ?? (current.text as string);
    const title = data.title ?? (current.title as string);
    if (!title && !text) throw new HttpError(400, 'El escaneo no puede quedar vacío', 'validation');

    ctx.db
      .prepare(
        `UPDATE scans SET title = ?, text = ?, group_id = ?, position = ?, word_count = ?, page_label = ?, updated_at = datetime('now')
          WHERE id = ? AND user_id = ?`,
      )
      .run(title, text, groupId, position, countWords(text), data.pageLabel ?? (current.pageLabel as string), id, userId);
    res.json({ scan: findScan(userId, id) });
  });

  router.delete('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    findScan(userId, id);
    ctx.db.transaction(() => {
      ctx.db.prepare(`DELETE FROM analyses WHERE user_id = ? AND target_type = 'scan' AND target_id = ?`).run(userId, id);
      ctx.db.prepare('DELETE FROM scans WHERE id = ? AND user_id = ?').run(id, userId);
    })();
    res.status(204).end();
  });

  return router;
}

function defaultTitle(text: string) {
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
  return title || 'Escaneo sin título';
}
