import { expect, test } from '@playwright/test';
import { approveUser, ensureAdmin, isMobile, signUp } from './helpers';

test.describe('Autenticación', () => {
  test('redirige al login sin sesión', async ({ page }) => {
    await ensureAdmin(page);
    await page.goto('/catalogo');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Tu biblioteca te espera.' })).toBeVisible();
  });

  test('registro, cierre de sesión e inicio de sesión', async ({ page }) => {
    await ensureAdmin(page);
    const email = `e2e-ui-${Date.now()}@example.com`;
    await page.goto('/registro');
    await page.getByPlaceholder('Tu nombre').fill('Lucía');
    await page.getByPlaceholder('Nombre de la sala').fill('Sala General');
    await page.getByPlaceholder('tucorreo@ejemplo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('secreto123');
    await page.getByRole('button', { name: 'Solicitar acceso' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Espera la aprobación' })).toBeVisible();
    await approveUser(page, email);
    await page.goto('/login');
    await page.getByPlaceholder('tucorreo@ejemplo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('secreto123');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('heading', { name: '¡Hola, Lucía!' })).toBeVisible();

    // Cerrar sesión desde Ajustes (disponible en móvil y escritorio).
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Cerrar sesión' }).last().click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder('tucorreo@ejemplo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('clave-incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();

    await page.getByPlaceholder('••••••••').fill('secreto123');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
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
    await other.getByPlaceholder('Nombre de la sala').fill('Sala General');
    await other.getByPlaceholder('tucorreo@ejemplo.com').fill(user.email);
    await other.getByPlaceholder('••••••••').fill('secreto123');
    await other.getByRole('button', { name: 'Solicitar acceso' }).click();
    await expect(other.getByText('Ya existe una cuenta con ese correo')).toBeVisible();
    await other.close();
  });

  test('la cortina informativa móvil se abre y cierra sin desplazar el login', async ({ page }) => {
    await ensureAdmin(page);
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/login');
    const tab = page.getByRole('button', { name: 'Descubrir BiblioTru' });
    await expect(tab).toBeVisible();
    await expect(page.locator('.auth-curtain-cord')).toHaveCount(0);
    await tab.click();
    await expect(page.getByRole('heading', { name: 'Tus lecturas tienen un lugar.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar información de BiblioTru' })).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(tab).toHaveAttribute('aria-expanded', 'false');
    await tab.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Cerrar información de BiblioTru' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Cerrar información de BiblioTru' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });

  test('la pestaña cabe en pantallas pequeñas y respeta movimiento reducido', async ({ page }) => {
    await ensureAdmin(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/registro');
    await expect(page.getByRole('button', { name: 'Solicitar acceso' })).toBeVisible();

    await page.setViewportSize({ width: 320, height: 480 });
    await page.getByRole('button', { name: 'Descubrir BiblioTru' }).click();
    await expect.poll(() => page.evaluate(() => {
      const content = document.querySelector('.auth-curtain-content')!.getBoundingClientRect();
      const panel = document.querySelector('.auth-curtain')!.getBoundingClientRect();
      return content.bottom <= panel.bottom;
    })).toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Cerrar información de BiblioTru' }).click();
    await expect(page.locator('.auth-curtain-invite svg')).toHaveCSS('animation-name', 'none');
  });

  test('la navegación se adapta al tamaño de pantalla', async ({ page }) => {
    await signUp(page);
    await page.goto('/');
    const sidebar = page.locator('aside');
    const bottomNav = page.locator('nav.fixed');
    if (isMobile(page)) {
      await expect(sidebar).toBeHidden();
      await expect(bottomNav).toBeVisible();
      await bottomNav.getByRole('link', { name: 'Documentos' }).click();
      await expect(page.getByRole('heading', { name: 'Tus documentos' })).toBeVisible();
      // Ajustes pasa a la barra superior en móvil.
      await page.getByRole('banner').getByRole('link', { name: 'Ajustes' }).click();
      await expect(page).toHaveURL(/\/ajustes$/);
      await bottomNav.getByRole('link', { name: 'Catálogo' }).click();
    } else {
      await sidebar.getByRole('link', { name: 'Documentos' }).click();
      await expect(page.getByRole('heading', { name: 'Tus documentos' })).toBeVisible();
      await expect(sidebar).toBeVisible();
      await expect(bottomNav).toBeHidden();
      await sidebar.getByRole('link', { name: 'Catálogo' }).click();
    }
    await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
  });
});
