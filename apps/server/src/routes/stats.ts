import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { currentUser } from '../middleware/auth.js';

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Días consecutivos con escaneos, contando hasta hoy (o ayer, para no perder la racha a mitad del día). */
export function computeStreak(days: Set<string>, today: Date): number {
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(isoDay(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(isoDay(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// Diferencia del usuario respecto a UTC en minutos (p. ej. -300 para Perú o Colombia).
const querySchema = z.object({ tz: z.coerce.number().int().min(-840).max(840).default(0) });

export function statsRouter(ctx: AppContext) {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const { tz } = querySchema.parse(req.query);
    const totals = ctx.db
      .prepare(
        `SELECT COUNT(*) AS scans, COALESCE(SUM(word_count), 0) AS words,
                SUM(CASE WHEN group_id IS NULL THEN 1 ELSE 0 END) AS individual
           FROM scans WHERE user_id = ?`,
      )
      .get(userId) as { scans: number; words: number; individual: number | null };
    const { groups } = ctx.db.prepare('SELECT COUNT(*) AS groups FROM groups WHERE user_id = ?').get(userId) as { groups: number };

    // Los días se cuentan en la hora local del usuario, no en UTC.
    const dayRows = ctx.db
      .prepare(
        `SELECT date(created_at, ? || ' minutes') AS day, COUNT(*) AS count
           FROM scans WHERE user_id = ? GROUP BY day ORDER BY day DESC LIMIT 400`,
      )
      .all(String(tz), userId) as { day: string; count: number }[];
    const counts = new Map(dayRows.map((r) => [r.day, r.count]));
    const localNow = new Date(Date.now() + tz * 60_000);

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(localNow);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const day = isoDay(d);
      return { day, count: counts.get(day) ?? 0 };
    });

    const recentGroups = ctx.db
      .prepare(
        `SELECT g.id, g.title, g.color, g.updated_at AS updatedAt, COUNT(s.id) AS scanCount
           FROM groups g LEFT JOIN scans s ON s.group_id = g.id
          WHERE g.user_id = ? GROUP BY g.id ORDER BY g.updated_at DESC LIMIT 4`,
      )
      .all(userId);

    res.json({
      totals: { ...totals, individual: totals.individual ?? 0, groups },
      streak: computeStreak(new Set(counts.keys()), localNow),
      week,
      recentGroups,
    });
  });

  return router;
}
