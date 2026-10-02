import { fold } from './fold.js';

/** Marcadores de resaltado: caracteres de control que no aparecen en texto OCR. */
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

const WORD = /[\p{L}\p{N}]+/gu;

/** Palabras de la búsqueda, ya sin acentos ni mayúsculas (máximo 12). */
export function searchTerms(input: string) {
  return (fold(input).match(WORD) ?? []).slice(0, 12);
}

/**
 * Fragmento de unas `size` palabras alrededor de la primera coincidencia, con las palabras
 * encontradas entre MARK_START y MARK_END. La última palabra buscada cuenta como prefijo
 * («molin» encuentra «molinos»), igual que en la consulta a la base de datos.
 */
export function buildSnippet(text: string, terms: string[], size = 22) {
  // fold() conserva la longitud, así que las posiciones valen para el texto original.
  const words = [...fold(text).matchAll(WORD)].map((m) => ({ start: m.index, end: m.index + m[0].length, word: m[0] }));
  if (words.length === 0) return '';
  const exact = new Set(terms.slice(0, -1));
  const prefix = terms.at(-1) ?? '';
  const hit = (w: string) => exact.has(w) || (prefix !== '' && w.startsWith(prefix));

  const first = Math.max(0, words.findIndex((w) => hit(w.word)));
  const from = Math.max(0, Math.min(first - 5, words.length - size));
  const to = Math.min(words.length, from + size);

  let out = from > 0 ? '…' : '';
  for (let i = from; i < to; i++) {
    const w = words[i];
    if (i > from) out += text.slice(words[i - 1].end, w.start).replace(/\s+/g, ' ');
    const original = text.slice(w.start, w.end);
    out += hit(w.word) ? MARK_START + original + MARK_END : original;
  }
  return to < words.length ? `${out}…` : out;
}
