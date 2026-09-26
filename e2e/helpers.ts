import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const FIXTURES = path.join(__dirname, '.fixtures');
export const pageImage = (n: number) => path.join(FIXTURES, `pagina-${n}.png`);
export const BAD_IMAGE = path.join(FIXTURES, 'no-es-imagen.png');

const HEADERS = { 'X-Requested-With': 'ocryon' };
let seq = 0;

/** Crea un usuario nuevo por API (la cookie de sesión queda en el contexto del navegador). */
export async function signUp(page: Page, name = 'Ana Prueba') {
  const email = `e2e-${Date.now()}-${++seq}@example.com`;
  const password = 'secreto123';
  const res = await page.request.post('/api/auth/register', { headers: HEADERS, data: { name, email, password } });
  expect(res.status()).toBe(201);
  return { email, password, name };
}

export async function updateSettings(page: Page, data: Record<string, unknown>) {
  const res = await page.request.put('/api/settings', { headers: HEADERS, data });
  expect(res.ok()).toBeTruthy();
}

export async function createScans(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/scans', { headers: HEADERS, data });
  expect(res.status()).toBe(201);
  return (await res.json()) as { groupId: number | null; ids: number[] };
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 1024;

/** Espera a que aparezca un aviso (toast) con el texto indicado. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
}
