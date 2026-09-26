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
  const findUser = ctx.db.prepare('SELECT id, email, name FROM users WHERE id = ?');

  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next(new HttpError(401, 'Inicia sesión para continuar', 'unauthenticated'));
    try {
      const payload = jwt.verify(token, ctx.jwtSecret) as jwt.JwtPayload;
      const user = findUser.get(Number(payload.sub)) as SessionUser | undefined;
      if (!user) throw new Error('usuario eliminado');
      req.user = user;
      next();
    } catch {
      next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
    }
  };
}

/** Obtiene el usuario autenticado (solo usar detrás de requireAuth). */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'No autenticado', 'unauthenticated');
  return req.user;
}
