import { expect, test, type Page } from '@playwright/test';
import { BAD_IMAGE, expectToast, pageImage, signUp, updateSettings } from './helpers';

const cards = (page: Page) => page.getByTestId('page-card');
const upload = (page: Page, files: string[]) => page.locator('input[type=file][multiple]').setInputFiles(files);

/** Los pasos empiezan plegados; se abren al pulsarlos. */
async function openStep(page: Page, title: '¿Dónde se guarda?' | '¿Cómo escanear?') {
  // En móvil el título es corto («¿Dónde?», «¿Cómo?»), así que se busca por su primera palabra.
  const header = page.getByRole('button', { name: new RegExp(title.split(' ')[0]) });
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
}

async function chooseEngine(page: Page, name: 'OCR.space' | 'Gemini' | 'Tesseract') {
  await openStep(page, '¿Cómo escanear?');
  await page.getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) }).click();
}

test.describe('Escáner', () => {
  test('avisa si falta la API key del motor elegido', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    // Visible incluso con el paso plegado.
    await expect(page.getByText(/sin API key/i).locator('visible=true').first()).toBeVisible();
    await chooseEngine(page, 'Tesseract');
    await expect(page.getByText('Para usar OCR.space necesitas su API key')).toBeHidden();
  });

  test('modo manual con OCR.space: escanear, revisar en el visor, reordenar, quitar y guardar individuales', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');

    await upload(page, [pageImage(1), pageImage(2), pageImage(3)]);
    await expectToast(page, '3 imágenes añadidas');
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText('0 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).getByText('Sin escanear')).toHaveCount(3);
    // Numeradas en orden.
    await expect(cards(page).nth(2).getByText('3', { exact: true })).toBeVisible();

    // Escanear solo la primera página.
    await cards(page).nth(0).getByRole('button', { name: 'Escanear', exact: true }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible();
    await expect(page.getByText('1 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).nth(1).getByText('Sin escanear')).toBeVisible();

    // Escanear el resto de golpe: mientras tanto se ve una barra de progreso, no un spinner.
    await page.getByRole('button', { name: 'Escanear (2)' }).click();
    const bar = cards(page).getByRole('progressbar').first();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', /^[1-9]\d*$/);
    await expect(page.getByText('3 de 3 escaneadas')).toBeVisible();

    // Corregir el texto de la segunda página desde el visor.
    await cards(page).nth(1).getByRole('button', { name: 'Ver texto' }).click();
    const viewer = page.getByRole('dialog', { name: 'Página 2' });
    await expect(viewer.getByText('de 3')).toBeVisible();
    await viewer.getByLabel('Texto de la página').fill('Texto corregido a mano');
    await viewer.getByRole('button', { name: 'Guardar texto' }).click();
    await expectToast(page, 'Texto actualizado');
    await viewer.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(cards(page).nth(1).getByText('Texto corregido a mano')).toBeVisible();

    // Moverla al principio y quitar la última.
    await cards(page).nth(1).getByRole('button', { name: 'Mover antes' }).click();
    await expect(cards(page).nth(0).getByText('Texto corregido a mano')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar página 3' }).click();
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Guardar (2)' }).click();
    await expect(page).toHaveURL(/\/catalogo\?vista=individuales$/);
    await expectToast(page, '¡Guardado! +2');
    await expect(page.getByText('Texto corregido a mano').first()).toBeVisible();
    await expect(page.getByText(/Texto de OCR.space número \d+/).first()).toBeVisible();

    // Tras guardar, las fotos se descartan del escáner.
    await page.goto('/escanear');
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('visor: navegar, girar, escanear y quitar', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await page.getByRole('button', { name: 'Ver página 1' }).click();

    let viewer = page.getByRole('dialog', { name: 'Página 1' });
    await viewer.getByRole('button', { name: 'Página siguiente' }).click();
    viewer = page.getByRole('dialog', { name: 'Página 2' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Ir a la página 1' }).click();
    viewer = page.getByRole('dialog', { name: 'Página 1' });

    // Girar cambia la orientación de la foto (ancho ↔ alto).
    const img = viewer.getByRole('img', { name: 'Página 1' });
    const before = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
    await viewer.getByRole('button', { name: 'Girar' }).click();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight)).toBeCloseTo(1 / before, 2);

    await viewer.getByRole('button', { name: 'Escanear' }).click();
    await expect(viewer.getByLabel('Texto de la página')).toHaveValue(/Texto de OCR.space/);

    await viewer.getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByRole('dialog', { name: 'Página 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cards(page)).toHaveCount(1);
  });

  test('quitar todas las páginas', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Quitar todas' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quitar todas' }).click();
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('escaneo automático con Gemini y guardado en un grupo nuevo', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { geminiKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');
    await chooseEngine(page, 'Gemini');
    await page.getByRole('switch', { name: 'Escaneo automático' }).click();

    await upload(page, [pageImage(1), pageImage(2)]);
    // Sin pulsar «Escanear»: se procesan solas.
    await expect(page.getByText('2 de 2 escaneadas')).toBeVisible();

    await openStep(page, '¿Dónde se guarda?');
    await page.getByRole('button', { name: /^Libro o grupo/ }).click();
    await page.getByLabel('Nombre del grupo nuevo').fill('El Quijote');
    await page.getByRole('button', { name: 'Color blue' }).click();
    await page.getByRole('button', { name: 'Guardar (2)' }).click();

    await expect(page).toHaveURL(/\/catalogo\/grupo\/\d+$/);
    await expect(page.getByRole('heading', { name: 'El Quijote' })).toBeVisible();
    await expect(page.getByText('Página 1')).toBeVisible();
    await expect(page.getByText('Página 2')).toBeVisible();
  });

  test('pide nombre para el grupo nuevo antes de guardar', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await openStep(page, '¿Dónde se guarda?');
    await page.getByRole('button', { name: /^Libro o grupo/ }).click();
    await upload(page, [pageImage(1)]);
    await page.getByRole('button', { name: 'Ver página 1' }).click();
    await page.getByLabel('Texto de la página').fill('Escrito a mano');
    await page.getByRole('button', { name: 'Guardar texto' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Guardar (1)' }).click();
    await expectToast(page, 'Ponle un nombre al grupo');
    await expect(page.getByLabel('Nombre del grupo nuevo')).toBeVisible();
  });

  test('añadir páginas a un grupo existente desde su ficha', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    const res = await page.request.post('/api/scans', {
      headers: { 'X-Requested-With': 'ocryon' },
      data: { newGroup: { title: 'Mi libro' }, items: [{ text: 'Primera página guardada', engine: 'manual' }] },
    });
    const { groupId } = await res.json();

    await page.goto(`/catalogo/grupo/${groupId}`);
    await page.getByRole('button', { name: 'Añadir páginas' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/escanear\\?grupo=${groupId}$`));
    await expect(page.getByText('Grupo: Mi libro').or(page.getByText('se añadirán al final de «Mi libro»')).locator('visible=true').first()).toBeVisible();
    await openStep(page, '¿Dónde se guarda?');
    await expect(page.getByRole('group', { name: 'Grupo' }).getByRole('button', { name: 'Mi libro' })).toHaveAttribute('aria-pressed', 'true');

    await upload(page, [pageImage(3)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(page.getByText('1 de 1 escaneadas')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar (1)' }).click();

    await expect(page).toHaveURL(new RegExp(`/catalogo/grupo/${groupId}$`));
    await expect(page.getByText('2 páginas', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Página 2/ })).toBeVisible();
  });

  test('una API key inválida detiene la cola y muestra el error', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-invalida' });
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await page.getByRole('button', { name: 'Escanear (2)' }).click();
    await expect(cards(page).nth(0).getByText('La API key de OCR.space no es válida')).toBeVisible();
    // La segunda no se intenta: vuelve a quedar pendiente.
    await expect(cards(page).nth(1).getByText('Sin escanear')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Guardar/ })).toBeDisabled();
  });

  test('las páginas pendientes sobreviven a una recarga y no las ve otro usuario', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await expect(cards(page)).toHaveCount(2);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);

    await page.goto('/');
    await expect(page.getByText('Tienes 2 páginas sin guardar')).toBeVisible();

    // Otro usuario en el mismo navegador (mismo IndexedDB) no ve esas fotos.
    await page.request.post('/api/auth/logout', { headers: { 'X-Requested-With': 'ocryon' } });
    await signUp(page, 'Otro usuario');
    await page.goto('/escanear');
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('rechaza archivos que no son imágenes', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [BAD_IMAGE, pageImage(1)]);
    await expectToast(page, 'Una imagen no se pudo leer');
    await expect(cards(page)).toHaveCount(1);
  });

  test('cámara en ráfaga: fotos numeradas y se pueden quitar antes de terminar', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await page.getByRole('button', { name: 'Tomar fotos' }).click();
    const shutter = page.getByRole('button', { name: 'Tomar foto', exact: true });
    await expect(shutter).toBeEnabled();
    await shutter.click();
    await expect(page.getByText('1 página', { exact: true })).toBeVisible();
    await shutter.click();
    await shutter.click();
    await expect(page.getByText('3 páginas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Quitar foto 2' }).click();
    await expect(page.getByText('2 páginas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expect(cards(page)).toHaveCount(2);
  });

  test('Tesseract reconoce el texto en el propio dispositivo', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto('/escanear');
    await chooseEngine(page, 'Tesseract');
    await upload(page, [pageImage(1)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible({ timeout: 90_000 });
    await expect(cards(page).nth(0)).toContainText('lugar de la Mancha');
  });
});
