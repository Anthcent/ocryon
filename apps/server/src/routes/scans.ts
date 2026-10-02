import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
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

const SCAN_COLUMNS = `s.id, s.group_id AS "groupId", s.title, s.text, s.engine, s.language, s.position,
  s.word_count AS "wordCount", s.page_label AS "pageLabel", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

interface ScanRow {
  id: number;
  groupId: number | null;
  title: string;
  text: string;
  position: number;
  pageLabel: string;
}

export function scansRouter(ctx: AppContext) {
  const router = Router();

  const assertGroup = async (db: Queryable, userId: number, groupId: number) => {
    if (!(await db.one('SELECT 1 FROM groups WHERE id = ? AND user_id = ?', [groupId, userId]))) throw notFound('Grupo');
  };

  const nextPosition = async (db: Queryable, groupId: number) =>
    (await db.one<{ next: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM scans WHERE group_id = ?', [groupId]))!.next;

  const findScan = async (userId: number, id: number) => {
    const scan = await ctx.db.one<ScanRow>(
      `SELECT ${SCAN_COLUMNS}, g.title AS "groupTitle", g.color AS "groupColor"
         FROM scans s LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.id = ? AND s.user_id = ?`,
      [id, userId],
    );
    if (!scan) throw notFound('Escaneo');
    return scan;
  };

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const q = listSchema.parse(req.query);
    const where = q.scope === 'individual' ? 'AND s.group_id IS NULL' : '';
    const scans = await ctx.db.query(
      `SELECT ${SCAN_COLUMNS}, g.title AS "groupTitle", g.color AS "groupColor"
         FROM scans s LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.user_id = ? ${where}
        ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      [userId, q.limit, q.offset],
    );
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM scans s WHERE s.user_id = ? ${where}`, [userId]))!;
    res.json({ scans, total });
  });

  /** Guarda uno o varios escaneos, individuales o dentro de un grupo (existente o nuevo). */
  router.post('/', async (req, res) => {
    const userId = currentUser(req).id;
    const data = createSchema.parse(req.body);

    const result = await ctx.db.transaction(async (tx) => {
      let groupId: number | null = null;
      if (data.newGroup) {
        const g = data.newGroup;
        groupId = (await tx.one<{ id: number }>(
          'INSERT INTO groups (user_id, title, description, author, category, color, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
          [userId, g.title, g.description, g.author, g.category, g.color, g.totalPages],
        ))!.id;
      } else if (data.groupId) {
        await assertGroup(tx, userId, data.groupId);
        groupId = data.groupId;
      }

      let position = 0;
      if (groupId) {
        // Bloquea el grupo: dos guardados simultáneos no pueden repetir posiciones.
        await tx.run('SELECT 1 FROM groups WHERE id = ? FOR UPDATE', [groupId]);
        position = await nextPosition(tx, groupId);
        await tx.run('UPDATE groups SET updated_at = now() WHERE id = ?', [groupId]);
      }

      const ids: number[] = [];
      for (const [i, item] of data.items.entries()) {
        const title = item.title || (groupId ? `Página ${position + i + 1}` : defaultTitle(item.text));
        const row = await tx.one<{ id: number }>(
          `INSERT INTO scans (user_id, group_id, position, title, text, engine, language, word_count, page_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [userId, groupId, position + i, title, item.text, item.engine, item.language, countWords(item.text), item.pageLabel],
        );
        ids.push(row!.id);
      }
      return { groupId, ids };
    });

    res.status(201).json(result);
  });

  router.get('/:id', async (req, res) => {
    res.json({ scan: await findScan(currentUser(req).id, idParam.parse(req.params.id)) });
  });

  router.patch('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const current = await findScan(userId, id);
    const data = updateSchema.parse(req.body);

    let groupId = current.groupId;
    let position = current.position;
    if (data.groupId !== undefined && data.groupId !== groupId) {
      if (data.groupId !== null) {
        await assertGroup(ctx.db, userId, data.groupId);
        position = await nextPosition(ctx.db, data.groupId);
      }
      groupId = data.groupId;
    }
    const text = data.text ?? current.text;
    const title = data.title ?? current.title;
    if (!title && !text) throw new HttpError(400, 'El escaneo no puede quedar vacío', 'validation');

    await ctx.db.run(
      `UPDATE scans SET title = ?, text = ?, group_id = ?, position = ?, word_count = ?, page_label = ?, updated_at = now()
        WHERE id = ? AND user_id = ?`,
      [title, text, groupId, position, countWords(text), data.pageLabel ?? current.pageLabel, id, userId],
    );
    res.json({ scan: await findScan(userId, id) });
  });

  router.delete('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await findScan(userId, id);
    await ctx.db.transaction(async (tx) => {
      await tx.run(`DELETE FROM analyses WHERE user_id = ? AND target_type = 'scan' AND target_id = ?`, [userId, id]);
      await tx.run('DELETE FROM scans WHERE id = ? AND user_id = ?', [id, userId]);
    });
    res.status(204).end();
  });

  return router;
}

function defaultTitle(text: string) {
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
  return title || 'Escaneo sin título';
}
