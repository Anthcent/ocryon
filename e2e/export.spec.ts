import fs from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createScans, expectToast, signUp } from './helpers';

const HEADERS = { 'X-Requested-With': 'ocryon' };

/** Texto de un .docx (el contenido de word/document.xml, sin etiquetas). */
async function docxText(download: Download) {
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml
    .replace(/<w:p[ >]/g, '\n$&')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function pdfInfo(download: Download) {
  return download.path().then((p) => {
    const raw = fs.readFileSync(p!).toString('latin1');
    return { header: raw.slice(0, 5), pages: raw.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0 };
  });
}

async function downloadFrom(page: Page, click: () => Promise<void>) {
  const download = page.waitForEvent('download');
  await click();
  return download;
}

test.describe('Exportar a Word y PDF', () => {
  test('libro: Word con páginas elegidas y PDF con todas', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, {
      newGroup: { title: 'Don Quijote', author: 'Miguel de Cervantes', category: 'Novela' },
      items: [
        // Líneas cortadas como las deja el OCR, con una palabra partida por guion.
        { text: 'En un lugar de la Mancha, de cuyo nombre no quiero acordar-\nme, no ha mucho tiempo que vivía un hidalgo\nde los de lanza en astillero.', engine: 'manual', pageLabel: '11' },
        { text: 'Texto de la segunda hoja, que no se exporta.', engine: 'manual' },
        { text: 'Tercera hoja: la del alba sería.', engine: 'manual', pageLabel: '13' },
      ],
    });
    await page.goto(`/catalogo/grupo/${groupId}`);
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar' });

    // Word con las páginas 1 y 3.
    await dialog.getByRole('button', { name: 'Word', exact: true }).click();
    await dialog.getByRole('button', { name: 'Elegir páginas' }).click();
    await dialog.getByLabel('Rango de páginas').fill('1, 3');
    await expect(dialog.getByTestId('export-count')).toHaveText('2 de 3 páginas seleccionadas');
    await expect(dialog.getByRole('checkbox', { name: /^Página 2:/ })).not.toBeChecked();
    const word = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar Word (2 páginas)' }).click());
    expect(word.suggestedFilename()).toBe('Don Quijote (selección).docx');
    await expectToast(page, 'Listo: Don Quijote (selección).docx');
    const text = await docxText(word);
    expect(text).toContain('Don Quijote');
    expect(text).toContain('de Miguel de Cervantes');
    expect(text).toContain('2 de 3');
    // Líneas unidas en un párrafo y la palabra partida, recompuesta.
    expect(text).toContain('de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero.');
    expect(text).toContain('pág. 11');
    expect(text).toContain('la del alba sería');
    expect(text).not.toContain('segunda hoja');

    // PDF con todas: portada + una hoja por página.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    // Recuerda el último formato usado.
    await expect(dialog.getByRole('button', { name: 'Word', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
    const pdf = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar PDF (3 páginas)' }).click());
    expect(pdf.suggestedFilename()).toBe('Don Quijote.pdf');
    expect(await pdfInfo(pdf)).toEqual({ header: '%PDF-', pages: 4 });

    // Sin portada ni saltos, todo cabe en una hoja.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Portada con los datos' }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Cada página en una hoja nueva' }).uncheck();
    const compact = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar PDF (3 páginas)' }).click());
    expect((await pdfInfo(compact)).pages).toBe(1);
  });

  test('una página suelta y varios escaneos sueltos', async ({ page }) => {
    await signUp(page);
    const { ids } = await createScans(page, {
      items: [
        { text: 'Receta de pan\nHarina, agua y sal.', engine: 'manual' },
        { text: 'Lista de compras: leche y huevos.', engine: 'manual' },
      ],
    });
    await page.goto(`/escaneo/${ids[0]}`);
    await page.getByRole('button', { name: 'Exportar', exact: true }).locator('visible=true').first().click();
    const dialog = page.getByRole('dialog', { name: 'Exportar' });
    // Una sola página: no hay selección ni portada.
    await expect(dialog.getByRole('button', { name: 'Elegir páginas' })).toBeHidden();
    await dialog.getByRole('button', { name: 'Word', exact: true }).click();
    const single = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar Word' }).click());
    expect(single.suggestedFilename()).toBe('Receta de pan.docx');
    expect(await docxText(single)).toContain('Harina, agua y sal.');

    await page.goto('/catalogo?vista=individuales');
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Elegir páginas' }).click();
    await dialog.getByRole('checkbox', { name: /Receta de pan/ }).uncheck();
    const loose = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar Word (1 página)' }).click());
    const text = await docxText(loose);
    expect(text).toContain('leche y huevos');
    expect(text).not.toContain('Harina');
  });

  test('documentos: ficha en Word y reporte en PDF', async ({ page }) => {
    await signUp(page);
    const invoice = (title: string, total: string) => ({
      templateKey: 'factura',
      templateName: 'Factura',
      title,
      fields: [
        { key: 'emisor', label: 'Emisor', type: 'text', value: 'Librería El Quijote' },
        { key: 'total', label: 'Total', type: 'money', value: total },
      ],
      text: 'FACTURA ELECTRÓNICA\nTotal S/ ' + total,
      engine: 'manual',
      method: 'rules',
    });
    const created = await page.request.post('/api/documents', { headers: HEADERS, data: invoice('Factura F001-1', '118.00') });
    await page.request.post('/api/documents', { headers: HEADERS, data: invoice('Factura F001-2', '236.00') });
    const { document } = await created.json();

    await page.goto(`/documentos/${document.id}`);
    await page.getByRole('button', { name: 'Word / PDF' }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar documento' });
    await dialog.getByRole('button', { name: 'Word', exact: true }).click();
    const sheet = await downloadFrom(page, () => dialog.getByRole('button', { name: 'Descargar Word' }).click());
    expect(sheet.suggestedFilename()).toBe('Factura F001-1.docx');
    const text = await docxText(sheet);
    expect(text).toContain('Librería El Quijote');
    expect(text).toContain('118.00');
    expect(text).toContain('Texto leído');
    expect(text).toContain('FACTURA ELECTRÓNICA');

    await page.goto('/documentos');
    await page.getByRole('button', { name: 'Reporte' }).click();
    const report = page.getByRole('dialog', { name: 'Reporte de documentos' });
    await expect(report.getByTestId('report-count')).toHaveText('2 de 2 seleccionados');
    await report.getByRole('button', { name: 'Word', exact: true }).click();
    await report.getByRole('checkbox', { name: /Factura F001-2/ }).uncheck();
    const summary = await downloadFrom(page, () => report.getByRole('button', { name: 'Descargar Word' }).click());
    const reportText = await docxText(summary);
    expect(reportText).toContain('Resumen');
    expect(reportText).toContain('Factura F001-1');
    expect(reportText).not.toContain('Factura F001-2');

    await page.getByRole('button', { name: 'Reporte' }).click();
    await report.getByRole('button', { name: 'PDF', exact: true }).click();
    const pdf = await downloadFrom(page, () => report.getByRole('button', { name: 'Descargar PDF' }).click());
    expect(pdf.suggestedFilename()).toBe('Reporte de documentos.pdf');
    // Resumen + una ficha por documento.
    expect(await pdfInfo(pdf)).toEqual({ header: '%PDF-', pages: 3 });
  });
});
