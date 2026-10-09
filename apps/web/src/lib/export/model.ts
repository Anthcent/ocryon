/**
 * Descripción de un archivo exportado, independiente del formato. Los generadores de Word y PDF
 * (cargados solo al exportar) convierten este modelo en el archivo final.
 */

export type ExportFormat = 'docx' | 'pdf' | 'txt';

export type Block =
  | { kind: 'heading'; text: string; note?: string }
  | { kind: 'text'; paragraphs: string[] }
  | { kind: 'fields'; rows: [string, string][] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'pageBreak' };

export interface ExportModel {
  /** Nombre del archivo, sin extensión. */
  fileName: string;
  title: string;
  subtitle?: string;
  /** Datos de la portada o del encabezado (Autor, Categoría…). */
  meta: [string, string][];
  /** Portada en una hoja propia; si no, el título va al inicio de la primera página. */
  cover: boolean;
  /** Texto del encabezado de cada página. */
  header?: string;
  landscape?: boolean;
  blocks: Block[];
}

const SENTENCE_END = /[.!?:;»"”)\]…]$/;

/**
 * Convierte el texto de una página escaneada en párrafos.
 * - `reflow`: une las líneas cortadas por el ancho de la hoja («pala-↵bra» → «palabra») y
 *   detecta el fin de párrafo por línea en blanco o por una línea corta que cierra una frase.
 * - sin `reflow`: respeta los saltos de línea originales (cada línea, un párrafo).
 */
export function toParagraphs(text: string, reflow: boolean): string[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  if (!reflow) return clean.split('\n').map((l) => l.trimEnd());

  const paragraphs: string[] = [];
  for (const block of clean.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const longest = Math.max(...lines.map((l) => l.length));
    let current = '';
    for (const [i, line] of lines.entries()) {
      if (!current) current = line;
      else if (/[a-záéíóúüñ]-$/i.test(current) && /^[a-záéíóúüñ]/.test(line)) current = current.slice(0, -1) + line;
      else current += ` ${line}`;
      const isLast = i === lines.length - 1;
      // Una línea notablemente más corta que acaba una frase suele cerrar el párrafo.
      if (!isLast && SENTENCE_END.test(line) && line.length < longest * 0.75) {
        paragraphs.push(current);
        current = '';
      }
    }
    if (current) paragraphs.push(current);
  }
  return paragraphs;
}

/** Texto plano equivalente (para .txt). */
export function toPlainText(model: ExportModel): string {
  const out: string[] = [model.title];
  if (model.subtitle) out.push(model.subtitle);
  for (const [k, v] of model.meta) out.push(`${k}: ${v}`);
  out.push('');
  for (const b of model.blocks) {
    if (b.kind === 'heading') out.push('', b.note ? `${b.text} (${b.note})` : b.text, '');
    if (b.kind === 'text') out.push(b.paragraphs.join('\n\n'), '');
    if (b.kind === 'fields') out.push(...b.rows.map(([k, v]) => `${k}: ${v}`));
    if (b.kind === 'table') out.push(b.headers.join('\t'), ...b.rows.map((r) => r.join('\t')));
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 120) || 'ocryon';
