import type { FieldDef, FieldType } from './doc-templates';

/**
 * Extracción de datos sin IA: funciona en el dispositivo, sin conexión.
 * 1. Busca la etiqueta del campo (o sus alias) en el texto y toma el valor que la sigue.
 * 2. Si no la encuentra, usa el primer dato del tipo adecuado que quede libre (fecha, correo…).
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

const pad = (n: string) => n.padStart(2, '0');

export function findDate(s: string): string {
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = s.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = norm(s).match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|del\s+)?(\d{4})\b/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${pad(m[1])}`;
  return '';
}

/** «S/ 1.234,50» o «$1,234.50» → «1234.50». */
export function findMoney(input: string): string {
  // Los porcentajes («IGV 18%») no son importes.
  const s = input.replace(/\(?\s*\d+(?:[.,]\d+)?\s*%\s*\)?/g, ' ');
  const m = s.match(/(?:S\/\.?|\$|€|USD|PEN|EUR|MXN|COP|ARS|CLP)?\s*(-?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return '';
  let n = m[1].replace(/\s/g, '');
  const lastComma = n.lastIndexOf(',');
  const lastDot = n.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : '.';
  const decimals = n.length - Math.max(lastComma, lastDot) - 1;
  if ((lastComma >= 0 || lastDot >= 0) && decimals > 0 && decimals <= 2) {
    const intPart = n.slice(0, n.lastIndexOf(decimalSep)).replace(/[.,]/g, '');
    n = `${intPart}.${n.slice(n.lastIndexOf(decimalSep) + 1)}`;
  } else {
    n = n.replace(/[.,]/g, '');
  }
  const value = Number(n);
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(\d{1,4}\)[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3,4}/;

function parseValue(candidate: string, type: FieldType): string {
  const c = candidate.trim();
  if (!c) return '';
  switch (type) {
    case 'date':
      return findDate(c);
    case 'money':
      return findMoney(c);
    case 'number': {
      const m = c.match(/-?\d+(?:[.,]\d+)?/);
      return m ? m[0].replace(',', '.') : '';
    }
    case 'id': {
      // Primer «código» con al menos un dígito: F001-123, 45879632, 20512345678…
      const m = c.match(/[A-Z0-9][A-Z0-9-]*\d[A-Z0-9-]*/i);
      return m ? m[0] : '';
    }
    case 'email':
      return c.match(EMAIL)?.[0] ?? '';
    case 'phone':
      return c.match(PHONE)?.[0]?.trim() ?? '';
    case 'longtext':
      return c.slice(0, 400);
    default:
      return c.replace(/\s{2,}/g, ' ').slice(0, 120);
  }
}

function fallback(text: string, type: FieldType, used: Set<string>, field: FieldDef): string {
  if (type === 'email') return text.match(EMAIL)?.[0] ?? '';
  if (type === 'phone') return text.match(PHONE)?.[0]?.trim() ?? '';
  if (type === 'date') {
    for (const line of text.split('\n')) {
      const d = findDate(line);
      if (d && !used.has(d)) return d;
    }
  }
  // El total suele ser el importe más alto del documento.
  if (type === 'money' && /total/i.test(field.key + field.label)) {
    const amounts = [...text.matchAll(/\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\b/g)].map((m) => Number(findMoney(m[0])));
    const max = Math.max(...amounts.filter(Number.isFinite));
    return Number.isFinite(max) && max > 0 ? max.toFixed(2) : '';
  }
  return '';
}

export function extractFields(text: string, fields: FieldDef[]): Record<string, string> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const normLines = lines.map(norm);
  const used = new Set<string>();
  const result: Record<string, string> = {};

  for (const field of fields) {
    // Primero las etiquetas más largas y específicas («importe total» antes que «total»).
    const labels = [field.label, ...(field.aliases ?? [])].map(norm).sort((a, b) => b.length - a.length);
    let value = '';
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Las etiquetas muy cortas («de», «a», «n°») solo cuentan al inicio de la línea.
      const pattern = label.length <= 3 ? new RegExp(`^\\s*${escaped}(?![a-z0-9])`) : new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`);
      for (let i = 0; i < normLines.length && !value; i++) {
        const m = normLines[i].match(pattern);
        if (!m || m.index === undefined) continue;
        const start = m.index + m[0].length;
        const rest = lines[i].slice(start).replace(/^[\s:.\-#°º=|]+/, '');
        // El valor puede estar en la misma línea o en la siguiente («Apellidos» ↵ «GARCÍA LÓPEZ»).
        value = parseValue(rest, field.type) || parseValue(lines[i + 1] ?? '', field.type);
      }
      if (value) break;
    }
    if (!value) value = fallback(text, field.type, used, field);
    if (!value && field.firstLine && lines[0]) value = parseValue(lines[0], field.type);
    if (value) used.add(value);
    result[field.key] = value;
  }
  return result;
}
