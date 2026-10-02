import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { notFound } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';

export const GROUP_COLORS = ['green', 'blue', 'purple', 'orange', 'red', 'yellow'] as const;

/** Campos de un grupo (libro). Se reutilizan al crear un grupo nuevo desde el escáner. */
export const groupFields = {
  title: z.string().trim().min(1, 'El grupo necesita un nombre').max(160),
  description: z.string().trim().max(2000),
  author: z.string().trim().max(160),
  category: z.string().trim().max(60),
  color: z.enum(GROUP_COLORS),
  totalPages: z.number().int().min(1, 'El número de páginas debe ser mayor que 0').max(20000).nullable(),
};

export const groupSchema = z.object({
  title: groupFields.title,
  description: groupFields.description.default(''),
  author: groupFields.author.default(''),
  category: groupFields.category.default(''),
  color: groupFields.color.default('green'),
  totalPages: groupFields.totalPages.default(null),
});

// Sin valores por defecto: en una edición parcial, lo que no se envía se conserva.
const updateSchema = z.object({
  title: groupFields.title.optional(),
  description: groupFields.description.optional(),
  author: groupFields.author.optional(),
  category: groupFields.category.optional(),
  color: groupFields.color.optional(),
  totalPages: groupFields.totalPages.optional(),
});

const idParam = z.coerce.number().int().positive();

export const GROUP_COLUMNS = `g.id, g.title, g.description, g.author, g.category, g.color, g.total_pages AS "totalPages",
  g.created_at AS "createdAt", g.updated_at AS "updatedAt"`;

interface GroupRow {
  id: number;
  title: string;
  description: string;
  author: string;
  category: string;
  color: string;
  totalPages: number | null;
  createdAt: string;
  updatedAt: string;
}

export function groupsRouter(ctx: AppContext) {
  const router = Router();

  const findGroup = async (userId: number, id: number) => {
    const group = await ctx.db.one<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM groups g WHERE g.id = ? AND g.user_id = ?`, [id, userId]);
    if (!group) throw notFound('Grupo');
    return group;
  };

  router.get('/', async (req, res) => {
    const userId = currentUser(req).id;
    const groups = await ctx.db.query(
      `SELECT ${GROUP_COLUMNS}, COUNT(s.id) AS "scanCount", COALESCE(SUM(s.word_count), 0) AS "wordCount"
         FROM groups g LEFT JOIN scans s ON s.group_id = g.id
        WHERE g.user_id = ?
        GROUP BY g.id
        ORDER BY g.updated_at DESC, g.id DESC`,
      [userId],
    );
    res.json({ groups });
  });

  /** Categorías usadas por el usuario, para sugerirlas y filtrar. */
  router.get('/categories', async (req, res) => {
    const userId = currentUser(req).id;
    const categories = await ctx.db.query(
      `SELECT category, COUNT(*) AS count FROM groups WHERE user_id = ? AND category <> '' GROUP BY category ORDER BY count DESC, category`,
      [userId],
    );
    res.json({ categories });
  });

  router.post('/', async (req, res) => {
    const userId = currentUser(req).id;
    const data = groupSchema.parse(req.body);
    const { id } = (await ctx.db.one<{ id: number }>(
      'INSERT INTO groups (user_id, title, description, author, category, color, total_pages) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [userId, data.title, data.description, data.author, data.category, data.color, data.totalPages],
    ))!;
    res.status(201).json({ group: await findGroup(userId, id) });
  });

  router.get('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const group = await findGroup(userId, idParam.parse(req.params.id));
    const scans = await ctx.db.query(
      `SELECT id, title, text, engine, language, position, word_count AS "wordCount", page_label AS "pageLabel",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM scans WHERE group_id = ? AND user_id = ? ORDER BY position, id`,
      [group.id, userId],
    );
    res.json({ group, scans });
  });

  router.patch('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    const data = updateSchema.parse(req.body);
    const current = await findGroup(userId, id);
    const merged = { ...current, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) } as GroupRow;
    await ctx.db.run(
      `UPDATE groups SET title = ?, description = ?, author = ?, category = ?, color = ?, total_pages = ?, updated_at = now()
        WHERE id = ?`,
      [merged.title, merged.description, merged.author, merged.category, merged.color, merged.totalPages, id],
    );
    res.json({ group: await findGroup(userId, id) });
  });

  router.put('/:id/order', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await findGroup(userId, id);
    const { scanIds } = z.object({ scanIds: z.array(z.number().int().positive()).max(5000) }).parse(req.body);
    await ctx.db.transaction(async (tx) => {
      // Una sola sentencia: la posición de cada escaneo es su índice en la lista.
      await tx.run(
        `UPDATE scans s SET position = o.idx - 1
           FROM unnest(?::int[]) WITH ORDINALITY AS o(scan_id, idx)
          WHERE s.id = o.scan_id AND s.group_id = ? AND s.user_id = ?`,
        [scanIds, id, userId],
      );
      await tx.run('UPDATE groups SET updated_at = now() WHERE id = ?', [id]);
    });
    res.status(204).end();
  });

  router.delete('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await findGroup(userId, id);
    await ctx.db.transaction(async (tx) => {
      await tx.run(`DELETE FROM analyses WHERE user_id = ? AND target_type = 'group' AND target_id = ?`, [userId, id]);
      await tx.run(
        `DELETE FROM analyses WHERE user_id = ? AND target_type = 'scan' AND target_id IN (SELECT id FROM scans WHERE group_id = ?)`,
        [userId, id],
      );
      await tx.run('DELETE FROM groups WHERE id = ? AND user_id = ?', [id, userId]);
    });
    res.status(204).end();
  });

  return router;
}
