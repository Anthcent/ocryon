/**
 * Plegado de acentos compartido por la base de datos y el código, para que «Márquez», «MARQUEZ»
 * y «marquez» coincidan al buscar. La base de datos usa translate() con estas mismas dos cadenas
 * (ver migraciones): no las cambies sin añadir una migración que regenere las columnas de búsqueda.
 */
export const FOLD_FROM = 'áàâäãåéèêëíìîïóòôöõúùûüñçýÿÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇÝ';
export const FOLD_TO = 'aaaaaaeeeeiiiiooooouuuuncyyAAAAAAEEEEIIIIOOOOOUUUUNCY';

const MAP = new Map([...FOLD_FROM].map((c, i) => [c, FOLD_TO[i]]));

/** Igual que en SQL: translate(lower(x), FOLD_FROM, FOLD_TO). Conserva la longitud del texto. */
export function fold(text: string) {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += MAP.get(lower) ?? (lower.length === ch.length ? lower : ch);
  }
  return out;
}

/** Expresión SQL equivalente a fold() sobre una columna o expresión. */
export const foldSql = (expr: string) => `translate(lower(${expr}), '${FOLD_FROM}', '${FOLD_TO}')`;
