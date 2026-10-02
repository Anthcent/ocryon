export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} no encontrado`, 'not_found');

/** Error de PostgreSQL por violar una restricción UNIQUE (código 23505). */
export const isUniqueViolation = (err: unknown) => (err as { code?: unknown } | null)?.code === '23505';
