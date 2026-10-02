import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import type { AppContext } from '../context.js';
import { HttpError, isUniqueViolation } from '../lib/http-error.js';
import { currentUser, requireAuth, SESSION_COOKIE, signSession, type SessionUser } from '../middleware/auth.js';

const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  email: z.email('Correo no válido').trim().toLowerCase(),
  password,
});

const loginSchema = z.object({
  email: z.email('Correo no válido').trim().toLowerCase(),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

export function authRouter(ctx: AppContext) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos, espera unos minutos', code: 'rate_limited' },
  });

  const setSession = (res: Response, user: SessionUser) => {
    res.cookie(SESSION_COOKIE, signSession(ctx, user, config.sessionDays), {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.secureCookies,
      maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
      path: '/',
    });
  };

  router.post('/register', limiter, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const taken = new HttpError(409, 'Ya existe una cuenta con ese correo', 'email_taken');
    if (await ctx.db.one('SELECT 1 FROM users WHERE email = ?', [data.email])) throw taken;
    const hash = await bcrypt.hash(data.password, 12);
    const user = await ctx.db
      .transaction(async (tx) => {
        const created = (await tx.one<SessionUser>(
          'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?) RETURNING id, email, name',
          [data.email, data.name, hash],
        ))!;
        await tx.run('INSERT INTO settings (user_id) VALUES (?)', [created.id]);
        return created;
      })
      .catch((err) => {
        // Dos registros simultáneos con el mismo correo: gana uno, el otro recibe 409.
        if (isUniqueViolation(err)) throw taken;
        throw err;
      });
    setSession(res, user);
    res.status(201).json({ user });
  });

  router.post('/login', limiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const row = await ctx.db.one<SessionUser & { password_hash: string }>(
      'SELECT id, email, name, password_hash FROM users WHERE email = ?',
      [data.email],
    );
    // Comparamos siempre para no revelar por tiempo de respuesta si el correo existe.
    const ok = await bcrypt.compare(data.password, row?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!row || !ok) throw new HttpError(401, 'Correo o contraseña incorrectos', 'invalid_credentials');
    const user = { id: row.id, email: row.email, name: row.name };
    setSession(res, user);
    res.json({ user });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAuth(ctx), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  router.post('/change-password', limiter, requireAuth(ctx), async (req, res) => {
    const user = currentUser(req);
    const data = changePasswordSchema.parse(req.body);
    const row = (await ctx.db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]))!;
    if (!(await bcrypt.compare(data.currentPassword, row.password_hash))) {
      throw new HttpError(400, 'La contraseña actual no es correcta', 'invalid_credentials');
    }
    const hash = await bcrypt.hash(data.newPassword, 12);
    await ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    res.status(204).end();
  });

  return router;
}
