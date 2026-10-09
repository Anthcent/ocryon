import type { DocField, SavedDocument } from '../types';
import { safeFileName, toParagraphs, toPlainText, type Block, type ExportFormat, type ExportModel } from './model';

export type { ExportFormat, ExportModel } from './model';

export const FORMAT_INFO: Record<ExportFormat, { label: string; ext: string; mime: string }> = {
  docx: { label: 'Word', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  txt: { label: 'Texto', ext: 'txt', mime: 'text/plain;charset=utf-8' },
};

/** Genera el archivo (Word y PDF se cargan solo cuando hacen falta) y lo descarga. */
export async function exportFile(model: ExportModel, format: ExportFormat) {
  let blob: Blob;
  if (format === 'docx') blob = await (await import('./docx')).renderDocx(model);
  else if (format === 'pdf') blob = await (await import('./pdf')).renderPdf(model);
  else blob = new Blob([toPlainText(model)], { type: FORMAT_INFO.txt.mime });
  const name = `${safeFileName(model.fileName)}.${FORMAT_INFO[format].ext}`;
  downloadBlob(name, blob);
  return name;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface PageExportOptions {
  cover: boolean;
  /** Cada página escaneada empieza en una hoja nueva. */
  pageBreaks: boolean;
  /** Une las líneas cortadas por el OCR en párrafos. */
  reflow: boolean;
  /** Título por página («Página 3 · pág. 23»). */
  headings: boolean;
}

export interface ExportPage {
  title: string;
  pageLabel?: string;
  text: string;
  /** Posición en el libro (1, 2, 3…), si es parte de uno. */
  number?: number;
}

/** Libro, selección de páginas o escaneos sueltos. */
export function pagesModel(input: {
  fileName: string;
  title: string;
  subtitle?: string;
  meta: [string, string][];
  pages: ExportPage[];
  options: PageExportOptions;
}): ExportModel {
  const { options } = input;
  const blocks: Block[] = [];
  input.pages.forEach((page, i) => {
    if (i > 0 && options.pageBreaks) blocks.push({ kind: 'pageBreak' });
    // Con una sola página cuyo título ya es el del archivo, no se repite.
    const redundant = input.pages.length === 1 && page.title === input.title;
    if (options.headings && !redundant) {
      const note = page.pageLabel ? `pág. ${page.pageLabel}` : undefined;
      blocks.push({ kind: 'heading', text: page.title || (page.number ? `Página ${page.number}` : `Página ${i + 1}`), note });
    }
    const paragraphs = toParagraphs(page.text, options.reflow);
    blocks.push({ kind: 'text', paragraphs: paragraphs.length ? paragraphs : ['(Página sin texto)'] });
  });
  return { fileName: input.fileName, title: input.title, subtitle: input.subtitle, meta: input.meta, cover: options.cover, header: input.title, blocks };
}

const fieldRows = (fields: DocField[]): [string, string][] => fields.map((f) => [f.label, f.value.trim() || '—']);

const METHOD_LABEL: Record<SavedDocument['method'], string> = { ai: 'Detectado con IA', rules: 'Detectado en el dispositivo', manual: 'Llenado a mano' };
const dateEs = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

/** Ficha de un documento: sus datos y, si se quiere, el texto leído. */
export function documentModel(doc: SavedDocument, includeText: boolean): ExportModel {
  const blocks: Block[] = [{ kind: 'heading', text: 'Datos del documento' }, { kind: 'fields', rows: fieldRows(doc.fields) }];
  if (includeText && doc.text.trim()) {
    blocks.push({ kind: 'heading', text: 'Texto leído' }, { kind: 'text', paragraphs: toParagraphs(doc.text, false) });
  }
  return {
    fileName: doc.title,
    title: doc.title,
    subtitle: doc.templateName,
    meta: [
      ['Registrado', dateEs(doc.createdAt)],
      ['Origen de los datos', METHOD_LABEL[doc.method]],
    ],
    cover: false,
    header: `${doc.templateName} · ${doc.title}`,
    blocks,
  };
}

/** Reporte de varios documentos: resumen en tabla y la ficha de cada uno. */
export function documentsReportModel(docs: SavedDocument[], title: string, options: { details: boolean }): ExportModel {
  // Si todos son del mismo tipo, la tabla lleva sus campos como columnas.
  const sameType = docs.every((d) => d.templateKey === docs[0]?.templateKey);
  const columns = sameType ? (docs[0]?.fields ?? []).slice(0, 6) : [];
  const headers = ['Título', ...(sameType ? [] : ['Tipo']), ...columns.map((c) => c.label), 'Fecha'];
  const rows = docs.map((d) => [
    d.title,
    ...(sameType ? [] : [d.templateName]),
    ...columns.map((c) => d.fields.find((f) => f.key === c.key)?.value ?? ''),
    new Date(d.createdAt).toLocaleDateString('es'),
  ]);
  const blocks: Block[] = [{ kind: 'heading', text: 'Resumen' }, { kind: 'table', headers, rows }];
  if (options.details) {
    for (const d of docs) blocks.push({ kind: 'pageBreak' }, { kind: 'heading', text: d.title, note: d.templateName }, { kind: 'fields', rows: fieldRows(d.fields) });
  }
  return {
    fileName: title,
    title,
    subtitle: `${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}`,
    meta: [['Fecha del reporte', dateEs(new Date().toISOString())]],
    cover: false,
    header: title,
    landscape: headers.length > 5,
    blocks,
  };
}
