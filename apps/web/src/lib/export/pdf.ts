import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { Content, ContentText, CustomTableLayout, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Block, ExportModel } from './model';

// Fuente Roboto incluida en el propio archivo: acentos, ñ, «», —, … se ven bien sin depender del sistema.
pdfMake.addVirtualFileSystem(pdfFonts);

const ACCENT = '#1899d6';
const MUTED = '#777777';

const lightTable: CustomTableLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => '#d9d9d9',
  vLineColor: () => '#d9d9d9',
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

function renderBlock(block: Exclude<Block, { kind: 'pageBreak' }>): Content {
  switch (block.kind) {
    case 'heading':
      return {
        text: [block.text, ...(block.note ? [{ text: `  ${block.note}`, style: 'note' }] : [])],
        style: 'heading',
        headlineLevel: 1,
      } as ContentText;
    case 'text':
      return { stack: block.paragraphs.map((p) => ({ text: p, style: 'body' })) };
    case 'fields':
      return {
        table: {
          widths: ['32%', '*'],
          dontBreakRows: true,
          body: block.rows.map(([k, v]) => [{ text: k, bold: true, fillColor: '#f2f7fb' }, { text: v || '—' }]),
        },
        layout: lightTable,
        margin: [0, 0, 0, 12],
      };
    case 'table':
      return {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: block.headers.map(() => '*'),
          body: [block.headers.map((h) => ({ text: h, bold: true, fillColor: '#ddf4ff' })), ...block.rows.map((r) => r.map((v) => ({ text: v || '—' })))],
        },
        layout: lightTable,
        fontSize: block.headers.length > 5 ? 8 : 9.5,
        margin: [0, 0, 0, 12],
      };
  }
}

function titleBlock(model: ExportModel): Content[] {
  const generated = `Generado con BiblioTru el ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const align = model.cover ? 'center' : 'left';
  const meta: Content[] = model.meta.map(([k, v]) => ({ text: [{ text: `${k}: `, bold: true, color: MUTED }, v], alignment: align, margin: [0, 0, 0, 3] }));
  if (!model.cover) {
    return [
      { text: model.title, style: 'title' },
      ...(model.subtitle ? [{ text: model.subtitle, style: 'subtitle' } as Content] : []),
      ...meta,
      { text: generated, style: 'note', italics: true, margin: [0, 6, 0, 16] },
    ];
  }
  return [
    { text: model.title, style: 'title', alignment: 'center', margin: [0, 180, 0, 8] },
    ...(model.subtitle ? [{ text: model.subtitle, style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 28] } as Content] : []),
    ...meta,
    { text: generated, style: 'note', italics: true, alignment: 'center', margin: [0, 60, 0, 0] },
  ];
}

export async function renderPdf(model: ExportModel): Promise<Blob> {
  const content: Content[] = titleBlock(model);
  // Con portada, el contenido empieza en una hoja nueva.
  let breakNext = model.cover;
  for (const block of model.blocks) {
    if (block.kind === 'pageBreak') {
      breakNext = true;
      continue;
    }
    const node = renderBlock(block) as Content & { pageBreak?: string };
    if (breakNext) node.pageBreak = 'before';
    breakNext = false;
    content.push(node);
  }
  const hideOnCover = (page: number) => model.cover && page === 1;

  const definition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: model.landscape ? 'landscape' : 'portrait',
    pageMargins: [56, 60, 56, 56],
    info: { title: model.title, creator: 'BiblioTru', producer: 'BiblioTru' },
    header: (page) => (hideOnCover(page) || !model.header ? null : { text: model.header, alignment: 'right', fontSize: 8, color: MUTED, margin: [56, 26, 56, 0] }),
    footer: (page, pages) => (hideOnCover(page) ? null : { text: `Página ${page} de ${pages}`, alignment: 'center', fontSize: 8, color: MUTED, margin: [0, 22, 0, 0] }),
    // Un título no se queda solo al final de una hoja.
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.getFollowingNodesOnPage().length === 0,
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.25, color: '#333333' },
    styles: {
      title: { fontSize: 26, bold: true, color: '#3c3c3c', margin: [0, 0, 0, 4] },
      subtitle: { fontSize: 15, bold: true, color: ACCENT, margin: [0, 0, 0, 8] },
      heading: { fontSize: 14, bold: true, color: ACCENT, margin: [0, 10, 0, 6] },
      note: { fontSize: 9, color: MUTED, bold: false },
      body: { alignment: 'justify', margin: [0, 0, 0, 7] },
    },
  };
  return pdfMake.createPdf(definition).getBlob();
}
