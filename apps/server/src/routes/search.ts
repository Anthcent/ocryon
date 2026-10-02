import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { buildSnippet, searchTerms } from '../lib/snippet.js';
import { currentUser } from '../middleware/auth.js';

const querySchema = z.object({
  q: z.string().trim().max(200).default(''),
  groupId: z.coerce.number().int().positive().optional(),
  /** «group»: solo páginas de libros; «individual»: solo escaneos sueltos. */
  type: z.enum(['all', 'group', 'individual']).default('all'),
  category: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

/** Consulta de PostgreSQL (to_tsquery) segura: todas las palabras, la última como prefijo. */
export function toTsQuery(terms: string[]): string {
  return terms.map((t, i) => (i === terms.length - 1 ? `${t}:*` : t)).join(' & ');
}

export function searchRouter(ctx: AppContext) {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const { q, groupId, type, category, limit } = querySchema.parse(req.query);
    const terms = searchTerms(q);
    if (terms.length === 0) return res.json({ results: [], total: 0 });

    const filters: string[] = [];
    const params: unknown[] = [toTsQuery(terms), userId];
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

    const rows = await ctx.db.query<{ text: string; total: number } & Record<string, unknown>>(
      `WITH q AS (SELECT to_tsquery('simple', ?) AS query)
       SELECT s.id, s.title, s.group_id AS "groupId", g.title AS "groupTitle", g.color AS "groupColor",
              g.author AS "groupAuthor", g.category AS "groupCategory",
              s.position, s.page_label AS "pageLabel", s.word_count AS "wordCount", s.created_at AS "createdAt",
              s.text, COUNT(*) OVER () AS total
         FROM scans s CROSS JOIN q
         LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.search @@ q.query AND s.user_id = ? ${where}
        ORDER BY ts_rank(s.search, q.query) DESC, s.id DESC
        LIMIT ?`,
      [...params, limit],
    );
    const total = rows[0]?.total ?? 0;
    const results = rows.map(({ text, total: _total, ...r }) => ({ ...r, snippet: buildSnippet(text, terms) }));
    res.json({ results, total });
  });

  return router;
}
