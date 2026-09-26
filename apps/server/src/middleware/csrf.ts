import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF: además de la cookie SameSite=Lax, toda petición que modifica datos
 * debe llevar una cabecera personalizada, que un formulario de otro sitio no puede enviar.
 */
export function requireCustomHeader(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || req.get('x-requested-with') === 'ocryon') return next();
  next(new HttpError(403, 'Petición rechazada', 'csrf'));
}
