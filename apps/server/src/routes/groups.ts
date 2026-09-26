import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';

export const GROUP_COLORS = ['green', 'blue', 'purple', 'orange', 'red', 'yellow'] as const;

const groupSchema = z.object({
  title: z.string().trim().min(1, 'El grupo necesita un nombre').max(160),
  description: z.string().trim().max(2000).default(''),
  color: z.enum(GROUP_COLORS).default('green'),
});

const idParam = z.coerce.number().int().positive();

export function groupsRouter(ctx: AppContext) {
  const router = Router();

  const findGroup = (userId: number, id: number) => {
    const group = ctx.db
      .prepare('SELECT id, title, description, color, created_at AS createdAt, updated_at AS updatedAt FROM groups WHERE id = ? AND user_id = ?')
      .get(id, userId);
    if (!group) throw notFound('Grupo');
    return group as Record<string, unknown>;
  };

  router.get('/', (req, res) => {
    const userId = currentUser(req).id;
    const groups = ctx.db
      .prepare(
        `SELECT g.id, g.title, g.description, g.color, g.created_at AS createdAt, g.updated_at AS updatedAt,
                COUNT(s.id) AS scanCount, COALESCE(SUM(s.word_count), 0) AS wordCount
           FROM groups g LEFT JOIN scans s ON s.group_id = g.id
          WHERE g.user_id = ?
          GROUP BY g.id
          ORDER BY g.updated_at DESC`,
      )
      .all(userId);
    res.json({ groups });
  });

  router.post('/', (req, res) => {
    const userId = currentUser(req).id;
    const data = groupSchema.parse(req.body);
    const result = ctx.db
      .prepare('INSERT INTO groups (user_id, title, description, color) VALUES (?, ?, ?, ?)')
      .run(userId, data.title, data.description, data.color);
    res.status(201).json({ group: findGroup(userId, Number(result.lastInsertRowid)) });
  });

  router.get('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const group = findGroup(userId, idParam.parse(req.params.id));
    const scans = ctx.db
      .prepare(
        `SELECT id, title, text, engine, language, position, word_count AS wordCount,
                created_at AS createdAt, updated_at AS updatedAt
           FROM scans WHERE group_id = ? AND user_id = ? ORDER BY position, id`,
      )
      .all(group.id, userId);
    res.json({ group, scans });
  });

  router.patch('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const data = groupSchema.partial().parse(req.body);
    const current = findGroup(userId, id);
    ctx.db
      .prepare(`UPDATE groups SET title = ?, description = ?, color = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(data.title ?? current.title, data.description ?? current.description, data.color ?? current.color, id);
    res.json({ group: findGroup(userId, id) });
  });

  router.put('/:id/order', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    findGroup(userId, id);
    const { scanIds } = z.object({ scanIds: z.array(z.number().int().positive()).max(5000) }).parse(req.body);
    const update = ctx.db.prepare('UPDATE scans SET position = ? WHERE id = ? AND group_id = ? AND user_id = ?');
    ctx.db.transaction(() => {
      scanIds.forEach((scanId, index) => update.run(index, scanId, id, userId));
      ctx.db.prepare(`UPDATE groups SET updated_at = datetime('now') WHERE id = ?`).run(id);
    })();
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    findGroup(userId, id);
    ctx.db.transaction(() => {
      ctx.db.prepare(`DELETE FROM analyses WHERE user_id = ? AND target_type = 'group' AND target_id = ?`).run(userId, id);
      ctx.db
        .prepare(`DELETE FROM analyses WHERE user_id = ? AND target_type = 'scan' AND target_id IN (SELECT id FROM scans WHERE group_id = ?)`)
        .run(userId, id);
      ctx.db.prepare('DELETE FROM groups WHERE id = ? AND user_id = ?').run(id, userId);
    })();
    res.status(204).end();
  });

  return router;
}
