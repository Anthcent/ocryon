import { expect, test } from '@playwright/test';
import { createScans, signUp } from './helpers';
// Ninguna pantalla debe tener desplazamiento horizontal en móvil.
test('sin desbordamiento horizontal', async ({ page }) => {
  await signUp(page);
  const { groupId, ids } = await createScans(page, { newGroup: { title: 'Un título de libro bastante largo para probar', author: 'Autor con nombre largo', category: 'Novela', totalPages: 10 }, items: [{ text: 'hidalgo '.repeat(50), engine: 'manual' }] });
  await createScans(page, { items: [{ text: 'Nota: comprar el libro del hidalgo para la clase de literatura de mañana.', engine: 'manual' }] });
  for (const url of ['/', '/escanear', '/catalogo', '/catalogo?vista=individuales', `/catalogo/grupo/${groupId}`, `/escaneo/${ids[0]}`, '/buscar?q=hidalgo', '/ajustes']) {
    await page.goto(url);
    await page.waitForTimeout(600);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, url).toBeLessThanOrEqual(cw);
  }
});
