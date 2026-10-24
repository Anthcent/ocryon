import { expect, test } from '@playwright/test';
import { createScans, ensureAdmin, signUp } from './helpers';

test('admin actualiza sala y lee catálogo de cada usuario', async ({ page }) => {
  await ensureAdmin(page);
  const person = await signUp(page, 'Luz Biblioteca');
  await createScans(page, {
    newGroup: { title: 'Historia de Trujillo' },
    items: [
      { title: 'Página uno', text: 'Lectura del primer capítulo', engine: 'manual' },
      { title: 'Página dos', text: 'Lectura del segundo capítulo', engine: 'manual' },
    ],
  });
  await createScans(page, { items: [{ title: 'Apunte suelto', text: 'Nota individual', engine: 'manual' }] });
  const document = await page.request.post('/api/documents', {
    headers: { 'X-Requested-With': 'ocryon' },
    data: { templateKey: 'letter', templateName: 'Carta', title: 'Carta de prueba', fields: [], text: 'Documento de la sala' },
  });
  expect(document.status()).toBe(201);
  const login = await page.request.post('/api/auth/login', {
    headers: { 'X-Requested-With': 'ocryon' },
    data: { email: 'admin-e2e@example.com', password: 'secreto123' },
  });
  expect(login.status()).toBe(200);
  const list = await page.request.get('/api/administration/users');
  const { users } = await list.json() as { users: { id: number; email: string }[] };
  const personId = users.find((user) => user.email === person.email)!.id;

  await page.goto('/administracion');
  await page.getByRole('button', { name: 'Usuarios' }).click();
  await page.locator(`a[href="/administracion/usuarios/${personId}"]`).click();
  await expect(page.getByRole('heading', { name: person.name, exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Sala' }).fill('Sala de Investigación');
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Datos del usuario guardados' })).toBeVisible();
  await expect(page.getByText('Sala de Investigación')).toBeVisible();

  await page.getByText('Historia de Trujillo').click();
  await expect(page.getByText('Página uno')).toBeVisible();
  await page.getByText('Página uno').click();
  await expect(page.getByText('Lectura del primer capítulo')).toBeVisible();
  await page.getByText('Apunte suelto').click();
  await expect(page.getByText('Nota individual')).toBeVisible();
  await page.getByText('Carta de prueba').click();
  await expect(page.getByText('Documento de la sala')).toBeVisible();
});
