import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { HttpError, notFound } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';
import { analyzeWithGemini } from '../services/analysis.js';
import { getApiKey, loadSettingsRow } from '../services/settings.js';

const targetSchema = z.object({
  targetType: z.enum(['group', 'scan']),
  targetId: z.coerce.number().int().positive(),
});

const offlineSchema = targetSchema.extend({
  // El análisis offline se calcula en el dispositivo; el servidor solo lo guarda.
  content: z.record(z.string(), z.unknown()).refine((c) => JSON.stringify(c).length < 200_000, 'Análisis demasiado grande'),
});

export function analysesRouter(ctx: AppContext) {
  const router = Router();

  const ANALYSIS_COLUMNS = `id, target_type AS "targetType", target_id AS "targetId", mode, content, created_at AS "createdAt"`;
  const parse = (row: { content: string }) => ({ ...row, content: JSON.parse(row.content) });

  /** Devuelve el texto completo y el título del grupo o escaneo, verificando que sea del usuario. */
  const loadTarget = async (userId: number, targetType: 'group' | 'scan', targetId: number) => {
    if (targetType === 'scan') {
      const scan = await ctx.db.one<{ title: string; text: string }>('SELECT title, text FROM scans WHERE id = ? AND user_id = ?', [targetId, userId]);
      if (!scan) throw notFound('Escaneo');
      return scan;
    }
    const group = await ctx.db.one<{ title: string }>('SELECT title FROM groups WHERE id = ? AND user_id = ?', [targetId, userId]);
    if (!group) throw notFound('Grupo');
    const pages = await ctx.db.query<{ text: string }>('SELECT text FROM scans WHERE group_id = ? ORDER BY position, id', [targetId]);
    return { title: group.title, text: pages.map((p) => p.text).join('\n\n') };
  };

  const getOne = async (userId: number, id: number) => {
    const row = await ctx.db.one<{ content: string }>(`SELECT ${ANALYSIS_COLUMNS} FROM analyses WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!row) throw notFound('Análisis');
    return parse(row);
  };

  const insert = async (userId: number, targetType: string, targetId: number, mode: string, content: unknown) => {
    const row = await ctx.db.one<{ content: string }>(
      `INSERT INTO analyses (user_id, target_type, target_id, mode, content) VALUES (?, ?, ?, ?, ?) RETURNING ${ANALYSIS_COLUMNS}`,
      [userId, targetType, targetId, mode, JSON.stringify(content)],
    );
    return parse(row!);
  };

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const { targetType, targetId } = targetSchema.parse(req.query);
    const rows = await ctx.db.query<{ content: string }>(
      `SELECT ${ANALYSIS_COLUMNS} FROM analyses WHERE user_id = ? AND target_type = ? AND target_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 20`,
      [userId, targetType, targetId],
    );
    res.json({ analyses: rows.map(parse) });
  });

  router.post('/offline', async (req, res) => {
    const userId = currentUser(req).id;
    const data = offlineSchema.parse(req.body);
    await loadTarget(userId, data.targetType, data.targetId);
    res.status(201).json({ analysis: await insert(userId, data.targetType, data.targetId, 'offline', data.content) });
  });

  router.post(
    '/online',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 10,
      keyGenerator: (req) => String(currentUser(req).id),
      message: { error: 'Demasiados análisis seguidos, espera un momento', code: 'rate_limited' },
    }),
    async (req, res) => {
      const userId = currentUser(req).id;
      const { targetType, targetId } = targetSchema.parse(req.body);
      const target = await loadTarget(userId, targetType, targetId);
      if (target.text.trim().length < 20) throw new HttpError(400, 'No hay suficiente texto para analizar', 'validation');
      const settings = await loadSettingsRow(ctx, userId);
      const content = await analyzeWithGemini(target.text, target.title, await getApiKey(ctx, userId, 'gemini'), settings.gemini_model);
      res.status(201).json({ analysis: await insert(userId, targetType, targetId, 'online', content) });
    },
  );

  router.delete('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await getOne(userId, id);
    await ctx.db.run('DELETE FROM analyses WHERE id = ? AND user_id = ?', [id, userId]);
    res.status(204).end();
  });

  return router;
}
