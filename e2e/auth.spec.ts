import { expect, test } from '@playwright/test';
import { isMobile, signUp } from './helpers';

test.describe('Autenticación', () => {
  test('redirige al login sin sesión', async ({ page }) => {
    await page.goto('/catalogo');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '¡Hola de nuevo!' })).toBeVisible();
  });

  test('registro, cierre de sesión e inicio de sesión', async ({ page }) => {
    const email = `e2e-ui-${Date.now()}@example.com`;
    await page.goto('/registro');
    await page.getByPlaceholder('Tu nombre').fill('Lucía');
    await page.getByPlaceholder('tucorreo@ejemplo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('secreto123');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('heading', { name: '¡Hola, Lucía!' })).toBeVisible();

    // Cerrar sesión desde Ajustes (disponible en móvil y escritorio).
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Cerrar sesión' }).last().click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder('tucorreo@ejemplo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('clave-incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();

    await page.getByPlaceholder('••••••••').fill('secreto123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: '¡Hola, Lucía!' })).toBeVisible();

    // La sesión sobrevive a una recarga.
    await page.reload();
    await expect(page.getByRole('heading', { name: '¡Hola, Lucía!' })).toBeVisible();
  });

  test('no permite registrar un correo repetido', async ({ page, browser }) => {
    const user = await signUp(page);
    const other = await browser.newPage();
    await other.goto('/registro');
    await other.getByPlaceholder('Tu nombre').fill('Otra');
    await other.getByPlaceholder('tucorreo@ejemplo.com').fill(user.email);
    await other.getByPlaceholder('••••••••').fill('secreto123');
    await other.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(other.getByText('Ya existe una cuenta con ese correo')).toBeVisible();
    await other.close();
  });

  test('la navegación se adapta al tamaño de pantalla', async ({ page }) => {
    await signUp(page);
    await page.goto('/');
    const sidebar = page.locator('aside');
    const bottomNav = page.locator('nav.fixed');
    if (isMobile(page)) {
      await expect(sidebar).toBeHidden();
      await expect(bottomNav).toBeVisible();
      await bottomNav.getByRole('link', { name: 'Catálogo' }).click();
    } else {
      await expect(sidebar).toBeVisible();
      await expect(bottomNav).toBeHidden();
      await sidebar.getByRole('link', { name: 'Catálogo' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
  });
});
