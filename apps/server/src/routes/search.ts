import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { currentUser } from '../middleware/auth.js';

/** Marcadores de resaltado: caracteres de control que no aparecen en texto OCR. */
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

const querySchema = z.object({
  q: z.string().trim().max(200).default(''),
  groupId: z.coerce.number().int().positive().optional(),
  /** «group»: solo páginas de libros; «individual»: solo escaneos sueltos. */
  type: z.enum(['all', 'group', 'individual']).default('all'),
  category: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

/** Convierte lo que escribe el usuario en una consulta FTS5 segura: todas las palabras, la última como prefijo. */
export function toFtsQuery(input: string): string {
  const tokens = input.match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .slice(0, 12)
    .map((t, i, all) => `"${t}"${i === all.length - 1 ? '*' : ''}`)
    .join(' ');
}

export function searchRouter(ctx: AppContext) {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const { q, groupId, type, category, limit } = querySchema.parse(req.query);
    const match = toFtsQuery(q);
    if (!match) return res.json({ results: [], total: 0 });

    const filters: string[] = [];
    const params: (string | number)[] = [];
    if (groupId) {
      filters.push('s.group_id = ?');
      params.push(groupId);
    }
    if (type === 'group') filters.push('s.group_id IS NOT NULL');
    if (type === 'individual') filters.push('s.group_id IS NULL');
    if (category) {
      filters.push('g.category = ?');
      params.push(category);
    }
    const where = filters.map((f) => `AND ${f}`).join(' ');

    const results = ctx.db
      .prepare(
        `SELECT s.id, s.title, s.group_id AS groupId, g.title AS groupTitle, g.color AS groupColor,
                g.author AS groupAuthor, g.category AS groupCategory,
                s.position, s.page_label AS pageLabel, s.word_count AS wordCount, s.created_at AS createdAt,
                snippet(scans_fts, 1, ?, ?, '…', 22) AS snippet
           FROM scans_fts
           JOIN scans s ON s.id = scans_fts.rowid
           LEFT JOIN groups g ON g.id = s.group_id
          WHERE scans_fts MATCH ? AND s.user_id = ? ${where}
          ORDER BY bm25(scans_fts, 5.0, 1.0)
          LIMIT ?`,
      )
      .all(MARK_START, MARK_END, match, userId, ...params, limit);
    const { total } = ctx.db
      .prepare(
        `SELECT COUNT(*) AS total FROM scans_fts JOIN scans s ON s.id = scans_fts.rowid LEFT JOIN groups g ON g.id = s.group_id
          WHERE scans_fts MATCH ? AND s.user_id = ? ${where}`,
      )
      .get(match, userId, ...params) as { total: number };
    res.json({ results, total });
  });

  return router;
}
