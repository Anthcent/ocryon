import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectToast, pageImage, signUp, updateSettings } from './helpers';

const form = (page: Page) => page.locator('main');

test.describe('Documentos', () => {
  test('escanear una factura: los datos se detectan en el dispositivo, se corrigen, se guardan y se exportan', async ({ page }) => {
    await signUp(page);
    // El simulador devuelve el texto de una factura con esta clave.
    await updateSettings(page, { ocrspaceKey: 'doc-factura-1', defaultEngine: 'ocrspace' });
    await page.goto('/documentos');
    await expect(page.getByText('Aún no tienes documentos')).toBeVisible();

    await page.getByRole('link', { name: 'Nuevo documento' }).click();
    await expect(page.getByRole('heading', { name: '¿Qué documento vas a escanear?' })).toBeVisible();
    await page.getByRole('button', { name: /^Factura/ }).click();

    // Se pueden quitar fotos antes de leer.
    await page.getByLabel('Subir imágenes del documento').setInputFiles([pageImage(1), pageImage(2)]);
    await expect(page.getByTestId('doc-photos').getByRole('img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Quitar foto 2' }).click();
    await expect(page.getByTestId('doc-photos').getByRole('img')).toHaveCount(1);
    // Sin clave de Gemini la IA queda desactivada.
    await expect(page.getByRole('switch', { name: 'Completar con IA' })).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Leer documento' }).click();
    await expect(page.getByText('Leyendo tu documento…')).toBeVisible();
    await expect(page.getByText('Detectado en tu dispositivo')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('detected-count')).toHaveText(/^8 de 8 campos detectados/);

    const f = form(page);
    await expect(f.getByLabel('Emisor', { exact: true })).toHaveValue('Librería El Quijote S.A.C.');
    await expect(f.getByLabel('RUC / NIF del emisor')).toHaveValue('20512345678');
    await expect(f.getByLabel('Número de factura')).toHaveValue('F001-000123');
    await expect(f.getByLabel('Fecha de emisión')).toHaveValue('2025-03-15');
    await expect(f.getByLabel('Cliente', { exact: true })).toHaveValue('María Pérez');
    await expect(f.getByLabel('Subtotal')).toHaveValue('1000.00');
    await expect(f.getByLabel('Impuesto (IGV / IVA)')).toHaveValue('180.00');
    await expect(f.getByLabel('Total', { exact: true })).toHaveValue('1180.00');
    await expect(page.getByLabel('Título del documento')).toHaveValue(/^Factura F001-000123/);

    await f.getByLabel('Cliente', { exact: true }).fill('María Pérez López');
    await page.getByRole('button', { name: /Guardar documento/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page).toHaveURL(/\/documentos\/\d+$/);
    await expect(f.getByLabel('Cliente', { exact: true })).toHaveValue('María Pérez López');

    // Editar desde el detalle.
    await f.getByLabel('Total', { exact: true }).fill('1200.00');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Cambios guardados');
    await page.reload();
    await expect(f.getByLabel('Total', { exact: true })).toHaveValue('1200.00');

    // Lista, búsqueda por cualquier dato y exportación.
    await page.getByRole('link', { name: 'Documentos' }).first().click();
    await expect(page.getByRole('link', { name: /Factura F001-000123/ })).toBeVisible();
    await page.getByLabel('Buscar documentos').fill('20512345678');
    await expect(page.getByRole('link', { name: /Factura F001-000123/ })).toBeVisible();
    await page.getByLabel('Buscar documentos').fill('no-existe-nada');
    await expect(page.getByText('Ningún documento coincide')).toBeVisible();
    await page.getByLabel('Limpiar búsqueda').click();

    await page.getByRole('group', { name: 'Filtrar por tipo' }).getByRole('button', { name: /Factura/ }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()]);
    expect(download.suggestedFilename()).toBe('Factura.csv');
    const csv = fs.readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('Título;Tipo;Fecha de registro;Emisor;RUC / NIF del emisor');
    expect(csv).toContain('María Pérez López');
    expect(csv).toContain('1200.00');

    // Borrar.
    await page.getByRole('link', { name: /Factura F001-000123/ }).click();
    await page.getByRole('button', { name: 'Borrar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Documento borrado');
    await expect(page.getByText('Aún no tienes documentos')).toBeVisible();
  });

  test('con la clave de Gemini la IA completa el formulario', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'doc-factura-2', geminiKey: 'clave-de-prueba-123', defaultEngine: 'ocrspace' });
    await page.goto('/documentos/nuevo');
    await page.getByRole('button', { name: /Boleta \/ Recibo/ }).click();
    await expect(page.getByRole('switch', { name: 'Completar con IA' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Subir imágenes del documento').setInputFiles([pageImage(1)]);
    await page.getByRole('button', { name: 'Leer documento' }).click();
    await expect(page.getByText('Detectado con IA')).toBeVisible({ timeout: 20_000 });
    await expect(form(page).getByLabel('Emisor', { exact: true })).toHaveValue('IA Emisor');
    await expect(form(page).getByLabel('Concepto')).toHaveValue('IA Concepto');
    await page.getByRole('button', { name: /Guardar documento/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page.getByText('Detectado con IA')).toBeVisible();
  });

  test('crear un tipo de documento propio y llenarlo a mano', async ({ page }) => {
    await signUp(page);
    await page.goto('/documentos');
    await page.getByRole('button', { name: 'Crear tipo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo tipo de documento' });
    await dialog.getByLabel('Nombre del tipo').fill('Orden de compra');
    await dialog.getByRole('button', { name: 'Icono 📦' }).click();
    await dialog.getByLabel('Nombre del campo 1').fill('Proveedor');
    await dialog.getByLabel('Nombre del campo 2').fill('Fecha de entrega');
    await dialog.getByRole('button', { name: 'Añadir campo' }).click();
    await dialog.getByLabel('Nombre del campo 3').fill('Importe');
    await dialog.getByLabel('Tipo del campo 3').selectOption('money');
    await dialog.getByRole('button', { name: 'Crear tipo' }).click();
    await expectToast(page, 'Tipo de documento creado');
    await expect(page.getByText('Proveedor · Fecha de entrega · Importe')).toBeVisible();

    await page.getByRole('link', { name: 'Nuevo documento' }).click();
    await page.getByRole('button', { name: /Orden de compra/ }).click();
    await page.getByRole('button', { name: 'Llenar a mano' }).click();
    await page.getByLabel('Título del documento').fill('Orden 55');
    await form(page).getByLabel('Proveedor').fill('Papelera del Sur');
    await form(page).getByLabel('Fecha de entrega').fill('2025-06-01');
    await form(page).getByLabel('Importe').fill('350.50');
    await page.getByRole('button', { name: /Guardar documento \(3\/3\)/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page.getByRole('heading', { name: 'Orden 55' })).toBeVisible();

    await page.goto('/documentos');
    await expect(page.getByRole('link', { name: /Orden 55/ })).toBeVisible();
    // Borrar el tipo conserva los documentos ya guardados.
    await page.getByRole('button', { name: 'Borrar tipo Orden de compra' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Tipo borrado');
    await expect(page.getByRole('link', { name: /Orden 55/ })).toBeVisible();
  });
});
