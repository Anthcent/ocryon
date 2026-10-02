import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { currentUser } from '../middleware/auth.js';

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Diferencia del usuario respecto a UTC en minutos (p. ej. -300 para Perú o Colombia).
const querySchema = z.object({ tz: z.coerce.number().int().min(-840).max(840).default(0) });

export function statsRouter(ctx: AppContext) {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const { tz } = querySchema.parse(req.query);
    const totals = (await ctx.db.one<{ scans: number; words: number; individual: number }>(
      `SELECT COUNT(*) AS scans, COALESCE(SUM(word_count), 0) AS words,
              COUNT(*) FILTER (WHERE group_id IS NULL) AS individual
         FROM scans WHERE user_id = ?`,
      [userId],
    ))!;
    const { groups } = (await ctx.db.one<{ groups: number }>('SELECT COUNT(*) AS groups FROM groups WHERE user_id = ?', [userId]))!;

    // Los días se cuentan en la hora local del usuario, no en UTC.
    const dayRows = await ctx.db.query<{ day: string; count: number }>(
      `SELECT to_char((created_at AT TIME ZONE 'UTC') + make_interval(mins => ?::int), 'YYYY-MM-DD') AS day, COUNT(*) AS count
         FROM scans WHERE user_id = ? AND created_at > now() - interval '9 days'
        GROUP BY day`,
      [tz, userId],
    );
    const counts = new Map(dayRows.map((r) => [r.day, r.count]));
    const localNow = new Date(Date.now() + tz * 60_000);

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(localNow);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const day = isoDay(d);
      return { day, count: counts.get(day) ?? 0 };
    });

    const recentGroups = await ctx.db.query(
      `SELECT g.id, g.title, g.author, g.category, g.color, g.total_pages AS "totalPages", g.updated_at AS "updatedAt",
              COUNT(s.id) AS "scanCount"
         FROM groups g LEFT JOIN scans s ON s.group_id = g.id
        WHERE g.user_id = ? GROUP BY g.id ORDER BY g.updated_at DESC, g.id DESC LIMIT 4`,
      [userId],
    );

    res.json({ totals: { ...totals, groups }, week, recentGroups });
  });

  return router;
}
