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

  /** Devuelve el texto completo y el título del grupo o escaneo, verificando que sea del usuario. */
  const loadTarget = (userId: number, targetType: 'group' | 'scan', targetId: number) => {
    if (targetType === 'scan') {
      const scan = ctx.db.prepare('SELECT title, text FROM scans WHERE id = ? AND user_id = ?').get(targetId, userId) as
        | { title: string; text: string }
        | undefined;
      if (!scan) throw notFound('Escaneo');
      return scan;
    }
    const group = ctx.db.prepare('SELECT title FROM groups WHERE id = ? AND user_id = ?').get(targetId, userId) as
      | { title: string }
      | undefined;
    if (!group) throw notFound('Grupo');
    const pages = ctx.db.prepare('SELECT text FROM scans WHERE group_id = ? ORDER BY position, id').all(targetId) as { text: string }[];
    return { title: group.title, text: pages.map((p) => p.text).join('\n\n') };
  };

  const insert = (userId: number, targetType: string, targetId: number, mode: string, content: unknown) => {
    const id = Number(
      ctx.db
        .prepare('INSERT INTO analyses (user_id, target_type, target_id, mode, content) VALUES (?, ?, ?, ?, ?)')
        .run(userId, targetType, targetId, mode, JSON.stringify(content)).lastInsertRowid,
    );
    return getOne(userId, id);
  };

  const getOne = (userId: number, id: number) => {
    const row = ctx.db
      .prepare('SELECT id, target_type AS targetType, target_id AS targetId, mode, content, created_at AS createdAt FROM analyses WHERE id = ? AND user_id = ?')
      .get(id, userId) as { content: string } | undefined;
    if (!row) throw notFound('Análisis');
    return { ...row, content: JSON.parse(row.content) };
  };

  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const { targetType, targetId } = targetSchema.parse(req.query);
    const rows = ctx.db
      .prepare(
        `SELECT id, target_type AS targetType, target_id AS targetId, mode, content, created_at AS createdAt
           FROM analyses WHERE user_id = ? AND target_type = ? AND target_id = ?
          ORDER BY created_at DESC, id DESC LIMIT 20`,
      )
      .all(userId, targetType, targetId) as { content: string }[];
    res.json({ analyses: rows.map((r) => ({ ...r, content: JSON.parse(r.content) })) });
  });

  router.post('/offline', (req, res) => {
    const userId = currentUser(req).id;
    const data = offlineSchema.parse(req.body);
    loadTarget(userId, data.targetType, data.targetId);
    res.status(201).json({ analysis: insert(userId, data.targetType, data.targetId, 'offline', data.content) });
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
      const target = loadTarget(userId, targetType, targetId);
      if (target.text.trim().length < 20) throw new HttpError(400, 'No hay suficiente texto para analizar', 'validation');
      const settings = loadSettingsRow(ctx, userId);
      const content = await analyzeWithGemini(target.text, target.title, getApiKey(ctx, userId, 'gemini'), settings.gemini_model);
      res.status(201).json({ analysis: insert(userId, targetType, targetId, 'online', content) });
    },
  );

  router.delete('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = z.coerce.number().int().positive().parse(req.params.id);
    getOne(userId, id);
    ctx.db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?').run(id, userId);
    res.status(204).end();
  });

  return router;
}
