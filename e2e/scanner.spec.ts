import { expect, test, type Page } from '@playwright/test';
import { BAD_IMAGE, expectToast, pageImage, signUp, updateSettings } from './helpers';

const cards = (page: Page) => page.getByTestId('page-card');
const upload = (page: Page, files: string[]) => page.locator('input[type=file][multiple]').setInputFiles(files);
const engine = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('Escáner', () => {
  test('avisa si falta la API key del motor elegido', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await expect(page.getByText('Para usar OCR.space necesitas su API key')).toBeVisible();
    await engine(page, 'Tesseract').click();
    await expect(page.getByText('Para usar OCR.space necesitas su API key')).toBeHidden();
  });

  test('modo manual con OCR.space: escanear, editar, reordenar, borrar y guardar individuales', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');

    await upload(page, [pageImage(1), pageImage(2), pageImage(3)]);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText('0 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).getByText('Sin escanear')).toHaveCount(3);

    // Escanear solo la primera página.
    await cards(page).nth(0).getByRole('button', { name: 'Escanear', exact: true }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible();
    await expect(page.getByText('1 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).nth(1).getByText('Sin escanear')).toBeVisible();

    // Escanear el resto de golpe.
    await page.getByRole('button', { name: 'Escanear (2)' }).click();
    await expect(page.getByText('3 de 3 escaneadas')).toBeVisible();

    // Corregir el texto de la segunda página.
    await cards(page).nth(1).getByRole('button', { name: 'Editar texto' }).click();
    const dialog = page.getByRole('dialog', { name: 'Revisar página' });
    await dialog.locator('textarea').fill('Texto corregido a mano');
    await dialog.getByRole('button', { name: 'Aplicar' }).click();
    await expect(cards(page).nth(1).getByText('Texto corregido a mano')).toBeVisible();

    // Moverla al principio y borrar la última.
    await cards(page).nth(1).getByRole('button', { name: 'Mover antes' }).click();
    await expect(cards(page).nth(0).getByText('Texto corregido a mano')).toBeVisible();
    await cards(page).nth(2).getByRole('button', { name: 'Eliminar' }).click();
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

  test('escaneo automático con Gemini y guardado en un grupo nuevo', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { geminiKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');
    await engine(page, 'Gemini').click();
    await page.getByRole('switch', { name: 'Escaneo automático' }).click();

    await upload(page, [pageImage(1), pageImage(2)]);
    // Sin pulsar «Escanear»: se procesan solas.
    await expect(page.getByText('2 de 2 escaneadas')).toBeVisible();
    await expect(cards(page).getByText('Gemini', { exact: true })).toHaveCount(2);

    await page.getByRole('button', { name: 'Grupo', exact: true }).click();
    await page.getByPlaceholder('Ej. Cien años de soledad').fill('El Quijote');
    await page.getByRole('button', { name: 'Color blue' }).click();
    await page.getByRole('button', { name: 'Guardar (2)' }).click();

    await expect(page).toHaveURL(/\/catalogo\/grupo\/\d+$/);
    await expect(page.getByRole('heading', { name: 'El Quijote' })).toBeVisible();
    await expect(page.getByText('Página 1')).toBeVisible();
    await expect(page.getByText('Página 2')).toBeVisible();
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
    await page.getByRole('button', { name: 'Añadir páginas' }).click();
    await expect(page).toHaveURL(new RegExp(`/escanear\\?grupo=${groupId}$`));
    await expect(page.getByRole('combobox', { name: 'Grupo' })).toHaveValue(String(groupId));
    await expect(page.getByText('se añadirán al final de «Mi libro»')).toBeVisible();

    await upload(page, [pageImage(3)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(page.getByText('1 de 1 escaneadas')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar (1)' }).click();

    await expect(page).toHaveURL(new RegExp(`/catalogo/grupo/${groupId}$`));
    await expect(page.getByText('2 páginas ·')).toBeVisible();
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

  test('las páginas pendientes sobreviven a una recarga y no las ve otro usuario', async ({ page, browser }) => {
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

  test('cámara en ráfaga: varias fotos seguidas', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await page.getByRole('button', { name: 'Tomar fotos' }).click();
    const shutter = page.getByRole('button', { name: 'Tomar foto', exact: true });
    await expect(shutter).toBeEnabled();
    await shutter.click();
    await expect(page.getByText('1 página', { exact: true })).toBeVisible();
    await shutter.click();
    await expect(page.getByText('2 páginas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expect(cards(page)).toHaveCount(2);
  });

  test('Tesseract reconoce el texto en el propio dispositivo', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto('/escanear');
    await engine(page, 'Tesseract').click();
    await upload(page, [pageImage(1)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible({ timeout: 90_000 });
    await expect(cards(page).nth(0)).toContainText('lugar de la Mancha');
  });
});
