import { expect, test } from '@playwright/test';
import { createScans, expectToast, signUp, updateSettings } from './helpers';

const LONG_TEXT =
  'En un lugar de la Mancha vivía un hidalgo. El hidalgo leía libros de caballerías. ' +
  'Tanto leía el hidalgo que perdió el juicio. Decidió hacerse caballero andante y salir por los caminos.';

test.describe('Análisis', () => {
  test('análisis rápido sin conexión y análisis con IA, con historial', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, { newGroup: { title: 'Quijote' }, items: [{ text: LONG_TEXT, engine: 'manual' }] });
    await page.goto(`/catalogo/grupo/${groupId}`);
    await page.getByRole('button', { name: 'Análisis' }).click();

    // Sin clave de Gemini, el análisis con IA está deshabilitado.
    await expect(page.getByRole('button', { name: 'Con IA (Gemini)' })).toBeDisabled();

    await page.getByRole('button', { name: 'Rápido (sin conexión)' }).click();
    await expect(page.getByText('Legibilidad')).toBeVisible();
    await expect(page.getByText('hidalgo ×3')).toBeVisible();
    await expect(page.getByText('Oraciones')).toBeVisible();

    await updateSettings(page, { geminiKey: 'clave-de-prueba-123' });
    await page.reload();
    await page.getByRole('button', { name: 'Análisis' }).click();
    await page.getByRole('button', { name: 'Con IA (Gemini)' }).click();
    await expect(page.getByText('Un hidalgo de la Mancha pierde el juicio')).toBeVisible();
    await expect(page.getByText('Ideas clave')).toBeVisible();
    await expect(page.getByText('¿Dónde vive el protagonista?')).toBeVisible();

    // Historial: se puede volver al análisis anterior.
    await page.getByRole('button', { name: /^Rápido ·/ }).click();
    await expect(page.getByText('Legibilidad')).toBeVisible();
    await page.getByRole('button', { name: 'Borrar análisis' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expect(page.getByText('Un hidalgo de la Mancha pierde el juicio')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Rápido ·/ })).toHaveCount(0);
  });

  test('el análisis también funciona en un escaneo individual', async ({ page }) => {
    await signUp(page);
    const { ids } = await createScans(page, { items: [{ text: LONG_TEXT, engine: 'manual' }] });
    await page.goto(`/escaneo/${ids[0]}`);
    await page.getByRole('button', { name: 'Análisis', exact: true }).click();
    await page.getByRole('button', { name: 'Rápido (sin conexión)' }).click();
    await expect(page.getByText('Frases principales')).toBeVisible();
  });
});

test.describe('Ajustes', () => {
  test('guardar, probar y borrar API keys', async ({ page }) => {
    await signUp(page);
    await page.goto('/ajustes');
    await expect(page.getByText('Sin configurar')).toHaveCount(2);

    const ocrInput = page.getByLabel('API key de OCR.space');
    await ocrInput.fill('K1234567890XYZW');
    await ocrInput.locator('xpath=ancestor::form').getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, 'Clave de OCR.space guardada');
    await expect(page.getByText('••••XYZW')).toBeVisible();
    await expect(ocrInput).toHaveValue('');

    await ocrInput.locator('xpath=ancestor::form').getByRole('button', { name: 'Probar' }).click();
    await expectToast(page, /OCR.space funciona correctamente/);

    // Una clave inválida se detecta al probarla.
    const geminiInput = page.getByLabel('API key de Gemini');
    await geminiInput.fill('clave-invalida');
    await geminiInput.locator('xpath=ancestor::form').getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, 'Clave de Gemini guardada');
    await geminiInput.locator('xpath=ancestor::form').getByRole('button', { name: 'Probar' }).click();
    await expectToast(page, 'La API key de Gemini no es válida');

    await page.getByRole('button', { name: 'Eliminar clave de Gemini' }).click();
    await expectToast(page, 'Clave eliminada');
    await expect(page.getByText('Sin configurar')).toHaveCount(1);
  });

  test('preferencias de escaneo se aplican al escáner', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { geminiKey: 'clave-de-prueba-123' });
    await page.goto('/ajustes');

    await page.getByRole('button', { name: 'Gemini', exact: true }).click();
    await expectToast(page, 'Ajustes guardados');
    await page.getByLabel('Idioma predeterminado').selectOption('eng');
    await page.getByRole('switch', { name: 'Escanear al tomar la foto' }).click();
    await expect(page.getByRole('switch', { name: 'Escanear al tomar la foto' })).toHaveAttribute('aria-checked', 'true');

    // Un modelo inexistente se rechaza al probar la conexión.
    const model = page.locator('input[list="gemini-models"]');
    await model.fill('modelo-inexistente');
    await model.locator('xpath=..').getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, 'Ajustes guardados');
    await page.getByLabel('API key de Gemini').locator('xpath=ancestor::form').getByRole('button', { name: 'Probar' }).click();
    await expectToast(page, 'El modelo "modelo-inexistente" no existe en Gemini');

    await page.reload();
    await expect(model).toHaveValue('modelo-inexistente');
    await expect(page.getByRole('switch', { name: 'Escanear al tomar la foto' })).toHaveAttribute('aria-checked', 'true');

    await page.goto('/escanear');
    const step = page.getByRole('button', { name: /¿Cómo/ });
    if ((await step.getAttribute('aria-expanded')) === 'false') await step.click();
    await expect(page.getByRole('button', { name: /^Gemini/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Idioma del texto' }).getByRole('button', { name: 'Inglés' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('switch', { name: 'Escaneo automático' })).toHaveAttribute('aria-checked', 'true');
  });

  test('cambiar la contraseña', async ({ page }) => {
    const user = await signUp(page);
    await page.goto('/ajustes');
    const current = page.locator('input[autocomplete="current-password"]');
    const next = page.locator('input[autocomplete="new-password"]');

    await current.fill('equivocada');
    await next.fill('nuevaclave123');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expectToast(page, 'La contraseña actual no es correcta');

    await current.fill(user.password);
    await next.fill('nuevaclave123');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expectToast(page, 'Contraseña actualizada');

    const res = await page.request.post('/api/auth/login', {
      headers: { 'X-Requested-With': 'ocryon' },
      data: { email: user.email, password: 'nuevaclave123' },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('Inicio', () => {
  test('muestra totales, actividad de la semana, libro en curso y grupos recientes', async ({ page }) => {
    await signUp(page, 'Carmen');
    await createScans(page, {
      newGroup: { title: 'Cuentos' },
      items: [
        { text: 'uno dos tres', engine: 'manual' },
        { text: 'cuatro cinco', engine: 'manual' },
      ],
    });
    await createScans(page, { items: [{ text: 'seis', engine: 'manual' }] });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¡Hola, Carmen!' })).toBeVisible();
    await expect(page.getByText('3 hojas escaneadas')).toBeVisible();
    await expect(page.getByText(/racha/i)).toHaveCount(0);
    // En escritorio, el menú lateral ofrece seguir con el último libro.
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(page.getByTestId('continue-card')).toContainText('Cuentos');
    }
    const tile = (label: string) => page.locator('main .grid > div').filter({ has: page.getByText(label, { exact: true }) }).locator('.text-2xl');
    await expect(tile('Escaneos')).toHaveText('3');
    await expect(tile('Grupos')).toHaveText('1');
    await expect(tile('Individuales')).toHaveText('1');
    await expect(tile('Palabras')).toHaveText('6');
    await page.getByRole('main').getByRole('link', { name: /Cuentos/ }).click();
    await expect(page.getByRole('heading', { name: 'Cuentos' })).toBeVisible();
  });
});
