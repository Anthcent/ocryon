import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from 'docx';
import type { Block, ExportModel } from './model';

const ACCENT = '1899D6';
const MUTED = '777777';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function cell(text: string, opts: { bold?: boolean; fill?: string; width?: number } = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: (text || '—').split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: opts.bold })] })),
  });
}

function renderBlock(block: Block): FileChild[] {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          children: [new TextRun(block.text), ...(block.note ? [new TextRun({ text: `  ${block.note}`, color: MUTED, size: 20 })] : [])],
        }),
      ];
    case 'text':
      return block.paragraphs.map((p) => new Paragraph({ style: 'BodyText', children: [new TextRun(p)] }));
    case 'fields':
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, { bold: true, fill: 'F2F7FB', width: 32 }), cell(v, { width: 68 })] })),
        }),
        new Paragraph({ text: '' }),
      ];
    case 'table':
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: block.headers.map((h) => cell(h, { bold: true, fill: 'DDF4FF' })) }),
            ...block.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v) => cell(v)) })),
          ],
        }),
        new Paragraph({ text: '' }),
      ];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
  }
}

function titleBlock(model: ExportModel): FileChild[] {
  const generated = `Generado con BiblioTru el ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const meta = model.meta.map(
    ([k, v]) =>
      new Paragraph({
        alignment: model.cover ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 60 },
        children: [new TextRun({ text: `${k}: `, bold: true, color: MUTED }), new TextRun(v)],
      }),
  );
  if (!model.cover) {
    return [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(model.title)] }),
      ...(model.subtitle ? [new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: model.subtitle, color: ACCENT, size: 28, bold: true })] })] : []),
      ...meta,
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: generated, color: MUTED, size: 18, italics: true })] }),
    ];
  }
  return [
    new Paragraph({ spacing: { before: 2800 }, alignment: AlignmentType.CENTER, heading: HeadingLevel.TITLE, children: [new TextRun(model.title)] }),
    ...(model.subtitle
      ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun({ text: model.subtitle, color: ACCENT, size: 32, bold: true })] })]
      : []),
    ...meta,
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 960 }, children: [new TextRun({ text: generated, color: MUTED, size: 18, italics: true })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

export async function renderDocx(model: ExportModel): Promise<Blob> {
  const doc = new Document({
    creator: 'BiblioTru',
    title: model.title,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      paragraphStyles: [
        {
          id: 'BodyText',
          name: 'Texto del libro',
          basedOn: 'Normal',
          run: { font: 'Georgia', size: 23 },
          paragraph: { spacing: { after: 160, line: 300 }, alignment: AlignmentType.JUSTIFIED },
        },
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 52, bold: true, color: '3C3C3C' }, paragraph: { spacing: { after: 120 } } },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'BodyText',
          run: { size: 28, bold: true, color: ACCENT },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: model.landscape ? { orientation: PageOrientation.LANDSCAPE } : undefined,
            margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 },
          },
          titlePage: model.cover,
        },
        headers: model.header
          ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: model.header, color: MUTED, size: 16 })] })] }) }
          : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], color: MUTED, size: 16 })],
              }),
            ],
          }),
        },
        children: [...titleBlock(model), ...model.blocks.flatMap(renderBlock)],
      },
    ],
  });
  return Packer.toBlob(doc);
}
