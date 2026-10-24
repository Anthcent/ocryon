import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/http-error.js';

export const SESSION_COOKIE = 'ocryon_session';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'personal';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  room: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(ctx: AppContext, user: SessionUser, days: number) {
  return jwt.sign({ sub: String(user.id) }, ctx.jwtSecret, { expiresIn: `${days}d` });
}

export function requireAuth(ctx: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next(new HttpError(401, 'Inicia sesión para continuar', 'unauthenticated'));
    let userId: number;
    try {
      userId = Number((jwt.verify(token, ctx.jwtSecret) as jwt.JwtPayload).sub);
    } catch {
      return next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
    }
    try {
      const user = await ctx.db.one<SessionUser>('SELECT id, email, name, role, status, room FROM users WHERE id = ?', [userId]);
      if (!user) return next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
      if (user.status !== 'approved') return next(new HttpError(403, 'Tu cuenta todavía no tiene acceso', 'account_not_approved'));
      req.user = user;
      next();
    } catch (err) {
      // Un fallo de la base de datos no es un problema de sesión: que lo gestione el manejador de errores.
      next(err);
    }
  };
}

export function requireRole(...roles: SessionUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(currentUser(req).role)) return next(new HttpError(403, 'No tienes permiso para esta operación', 'forbidden'));
    next();
  };
}

/** Obtiene el usuario autenticado (solo usar detrás de requireAuth). */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'No autenticado', 'unauthenticated');
  return req.user;
}
