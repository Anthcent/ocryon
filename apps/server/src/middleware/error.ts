import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({
      error: first?.message ?? 'Datos no válidos',
      code: 'validation',
      field: first?.path.join('.'),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen es demasiado grande' : 'No se pudo leer la imagen';
    return res.status(400).json({ error: message, code: 'upload' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor', code: 'internal' });
}
