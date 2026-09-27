/**
 * Detecta el número de página impreso en el texto de una hoja escaneada.
 * Busca en las primeras y últimas líneas formatos típicos: «23», «— 23 —», «- 23 -»,
 * «Página 23», «Pág. 23», «p. 23» o números romanos en minúscula («xii»).
 */
const PATTERNS = [
  /^[\s\-–—·•|]*(\d{1,4})[\s\-–—·•|]*$/,
  /^(?:p[áa]g(?:ina)?\.?|p\.)\s*(\d{1,4})$/i,
  /^[\s\-–—]*([ivxlc]{1,7})[\s\-–—]*$/,
];

function isLabelLine(line: string) {
  return line.length <= 14 && PATTERNS.some((p) => p.test(line));
}

export function detectPageLabel(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  // Primero el pie de página (lo más habitual), luego la cabecera.
  const candidates = [...lines.slice(-2).reverse(), ...lines.slice(0, 2)];
  for (const line of candidates) {
    if (line.length > 14) continue;
    for (const pattern of PATTERNS) {
      const m = line.match(pattern);
      if (m && m[1] !== '0') return m[1];
    }
  }
  return '';
}

/** Quita del texto la línea con el número de página (para no mostrarlo dos veces en el modo libro). */
export function stripPageLabel(text: string, label: string): string {
  if (!label) return text;
  const lines = text.split('\n');
  const nonEmpty = lines.map((l, i) => ({ l: l.trim(), i })).filter((x) => x.l);
  const edges = [...nonEmpty.slice(0, 2), ...nonEmpty.slice(-2)];
  const target = edges.find((x) => isLabelLine(x.l) && x.l.includes(label));
  if (!target) return text;
  return lines.filter((_, i) => i !== target.i).join('\n').trim();
}
