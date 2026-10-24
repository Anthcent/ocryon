import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/http-error.js';
import { currentUser, requireRole } from '../middleware/auth.js';

const reviewSchema = z.object({ status: z.enum(['approved', 'rejected', 'suspended']) });

export function administrationRouter(ctx: AppContext) {
  const router = Router();
  router.use(requireRole('admin', 'operator'));

  router.get('/users', async (_req, res) => {
    const users = await ctx.db.query(`SELECT id, name, email, room, role, status, created_at AS "createdAt",
      reviewed_at AS "reviewedAt" FROM users ORDER BY created_at DESC`);
    res.json({ users });
  });

  router.patch('/users/:id/status', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { status } = reviewSchema.parse(req.body);
    const actor = currentUser(req);
    const target = await ctx.db.one<{ role: string }>('SELECT role FROM users WHERE id = ?', [id]);
    if (!target) throw new HttpError(404, 'Usuario no encontrado', 'not_found');
    if (target.role !== 'personal') throw new HttpError(403, 'No se puede cambiar el estado de cuentas administrativas', 'forbidden');
    const user = await ctx.db.one(`UPDATE users SET status = ?, reviewed_by = ?, reviewed_at = now() WHERE id = ?
      RETURNING id, name, email, room, role, status`, [status, actor.id, id]);
    res.json({ user });
  });

  router.patch('/users/:id/role', requireRole('admin'), async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const role = z.enum(['personal', 'operator']).parse(req.body.role);
    const user = await ctx.db.one(`UPDATE users SET role = ? WHERE id = ? AND role <> 'admin' AND status = 'approved'
      RETURNING id, name, email, room, role, status`, [role, id]);
    if (!user) throw new HttpError(404, 'Usuario aprobado no encontrado', 'not_found');
    res.json({ user });
  });

  router.get('/archive', async (req, res) => {
    const userId = z.coerce.number().int().positive().optional().parse(req.query.userId);
    const filter = userId ? 'WHERE u.id = ?' : '';
    const rows = await ctx.db.query(`SELECT s.id, s.title, s.text, s.engine, s.language, s.word_count AS "wordCount",
      s.created_at AS "createdAt", s.group_id AS "groupId", g.title AS "groupTitle",
      u.id AS "userId", u.name AS "userName", u.room
      FROM scans s JOIN users u ON u.id = s.user_id LEFT JOIN groups g ON g.id = s.group_id
      ${filter} ORDER BY s.created_at DESC LIMIT 200`, userId ? [userId] : []);
    res.json({ scans: rows });
  });

  router.get('/documents', async (req, res) => {
    const userId = z.coerce.number().int().positive().optional().parse(req.query.userId);
    const filter = userId ? 'WHERE u.id = ?' : '';
    const rows = await ctx.db.query(`SELECT d.id, d.title, d.text, d.template_name AS "templateName",
      d.created_at AS "createdAt", u.id AS "userId", u.name AS "userName", u.room
      FROM documents d JOIN users u ON u.id = d.user_id
      ${filter} ORDER BY d.created_at DESC LIMIT 200`, userId ? [userId] : []);
    res.json({ documents: rows });
  });

  router.delete('/scans/:id', requireRole('admin'), async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const scan = await tx.one<{ user_id: number }>('SELECT user_id FROM scans WHERE id = ?', [id]);
      if (!scan) throw new HttpError(404, 'Escaneo no encontrado', 'not_found');
      await tx.run("DELETE FROM analyses WHERE user_id = ? AND target_type = 'scan' AND target_id = ?", [scan.user_id, id]);
      await tx.run('DELETE FROM scans WHERE id = ?', [id]);
    });
    res.status(204).end();
  });

  router.delete('/documents/:id', requireRole('admin'), async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (!(await ctx.db.run('DELETE FROM documents WHERE id = ?', [id]))) throw new HttpError(404, 'Documento no encontrado', 'not_found');
    res.status(204).end();
  });

  router.get('/reports', async (_req, res) => {
    const [totals, byRoom, monthly] = await Promise.all([
      ctx.db.one(`SELECT (SELECT COUNT(*) FROM users WHERE role = 'personal' AND status = 'approved') AS staff,
        (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM groups) AS books,
        (SELECT COUNT(*) FROM scans) AS pages,
        (SELECT COUNT(*) FROM documents) AS documents,
        (SELECT COALESCE(SUM(word_count), 0) FROM scans) AS words`),
      ctx.db.query(`SELECT room, SUM(books) AS books, SUM(pages) AS pages, SUM(documents) AS documents
        FROM (SELECT u.room,
          (SELECT COUNT(*) FROM groups g WHERE g.user_id = u.id) AS books,
          (SELECT COUNT(*) FROM scans s WHERE s.user_id = u.id) AS pages,
          (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) AS documents
          FROM users u WHERE u.role = 'personal') activity
        GROUP BY room ORDER BY pages DESC`),
      ctx.db.query(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
        COUNT(*) AS pages FROM scans GROUP BY 1 ORDER BY 1 DESC LIMIT 12`),
    ]);
    res.json({ totals, byRoom, monthly });
  });
  return router;
}
