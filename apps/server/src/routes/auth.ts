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
  room: z.string().trim().min(2, 'Indica tu sala').max(100),
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

  const setupAvailable = async () => !(await ctx.db.one('SELECT 1 FROM users WHERE role = ?', ['admin']));
  router.get('/setup-status', async (_req, res) => {
    res.json({ needsSetup: await setupAvailable() });
  });
  router.post('/setup-admin', limiter, async (req, res) => {
    // Never expose bootstrap on a public listener, even behind a reverse proxy.
    const local = ['127.0.0.1', '::1'].includes(config.host) &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
    if (!local) throw new HttpError(403, 'Configura el administrador desde localhost antes de publicar', 'setup_local_only');
    const data = registerSchema.omit({ room: true }).extend({ setupToken: z.string() }).parse(req.body);
    if (data.setupToken !== ctx.setupToken) throw new HttpError(403, 'Código de instalación incorrecto', 'invalid_setup_token');
    const hash = await bcrypt.hash(data.password, 12);
    const user = await ctx.db.transaction(async (tx) => {
      // Transaction-scoped advisory lock prevents simultaneous first-admin claims.
      await tx.one('SELECT pg_advisory_xact_lock(20540917)');
      if (await tx.one('SELECT 1 FROM users WHERE role = ?', ['admin'])) throw new HttpError(409, 'El administrador ya fue configurado', 'setup_complete');
      if (await tx.one('SELECT 1 FROM users WHERE email = ?', [data.email])) throw new HttpError(409, 'Ya existe una cuenta con ese correo', 'email_taken');
      const created = (await tx.one<SessionUser>(
        `INSERT INTO users (email, name, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'approved')
         RETURNING id, email, name, role, status, room`, [data.email, data.name, hash],
      ))!;
      await tx.run('INSERT INTO settings (user_id) VALUES (?)', [created.id]);
      return created;
    });
    setSession(res, user);
    res.status(201).json({ user });
  });

  router.post('/register', limiter, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const taken = new HttpError(409, 'Ya existe una cuenta con ese correo', 'email_taken');
    if (await ctx.db.one('SELECT 1 FROM users WHERE email = ?', [data.email])) throw taken;
    const hash = await bcrypt.hash(data.password, 12);
    const user = await ctx.db
      .transaction(async (tx) => {
        const created = (await tx.one<SessionUser>(
          'INSERT INTO users (email, name, password_hash, room) VALUES (?, ?, ?, ?) RETURNING id, email, name, role, status, room',
          [data.email, data.name, hash, data.room],
        ))!;
        await tx.run('INSERT INTO settings (user_id) VALUES (?)', [created.id]);
        return created;
      })
      .catch((err) => {
        // Dos registros simultáneos con el mismo correo: gana uno, el otro recibe 409.
        if (isUniqueViolation(err)) throw taken;
        throw err;
      });
    res.status(201).json({ user });
  });

  router.post('/login', limiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const row = await ctx.db.one<SessionUser & { password_hash: string }>(
      'SELECT id, email, name, role, status, room, password_hash FROM users WHERE email = ?',
      [data.email],
    );
    // Comparamos siempre para no revelar por tiempo de respuesta si el correo existe.
    const ok = await bcrypt.compare(data.password, row?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!row || !ok) throw new HttpError(401, 'Correo o contraseña incorrectos', 'invalid_credentials');
    if (row.status !== 'approved') throw new HttpError(403, 'Tu cuenta espera aprobación o fue suspendida', 'account_not_approved');
    const user = { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, room: row.room };
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
