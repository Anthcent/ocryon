import { expect, test } from '@playwright/test';
import { createScans, signUp } from './helpers';
// Ninguna pantalla debe tener desplazamiento horizontal en móvil.
test('sin desbordamiento horizontal', async ({ page }) => {
  await signUp(page);
  const { groupId, ids } = await createScans(page, { newGroup: { title: 'Un título de libro bastante largo para probar', author: 'Autor con nombre largo', category: 'Novela', totalPages: 10 }, items: [{ text: 'hidalgo '.repeat(50), engine: 'manual' }] });
  await createScans(page, { items: [{ text: 'Nota: comprar el libro del hidalgo para la clase de literatura de mañana.', engine: 'manual' }] });
  const doc = await page.request.post('/api/documents', {
    headers: { 'X-Requested-With': 'ocryon' },
    data: { templateKey: 'factura', templateName: 'Factura', title: 'Factura con un título muy largo para probar el desbordamiento F001-000123', fields: [{ key: 'emisor', label: 'Emisor', type: 'text', value: 'Una empresa con un nombre larguísimo S.A.C.' }], text: 'texto', engine: 'manual', method: 'manual' },
  });
  const { document } = await doc.json();
  for (const url of ['/documentos', '/documentos/nuevo', `/documentos/${document.id}`, '/', '/escanear', '/catalogo', '/catalogo?vista=individuales', `/catalogo/grupo/${groupId}`, `/escaneo/${ids[0]}`, '/buscar?q=hidalgo', '/ajustes']) {
    await page.goto(url);
    await page.waitForTimeout(600);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, url).toBeLessThanOrEqual(cw);
  }
});
