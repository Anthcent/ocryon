import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/http-error.js';

export const SESSION_COOKIE = 'ocryon_session';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
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
      const user = await ctx.db.one<SessionUser>('SELECT id, email, name FROM users WHERE id = ?', [userId]);
      if (!user) return next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
      req.user = user;
      next();
    } catch (err) {
      // Un fallo de la base de datos no es un problema de sesión: que lo gestione el manejador de errores.
      next(err);
    }
  };
}

/** Obtiene el usuario autenticado (solo usar detrás de requireAuth). */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'No autenticado', 'unauthenticated');
  return req.user;
}
