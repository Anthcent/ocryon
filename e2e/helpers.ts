import path from 'node:path';
import { expect, request, type Page } from '@playwright/test';

export const FIXTURES = path.join(__dirname, '.fixtures');
export const pageImage = (n: number) => path.join(FIXTURES, `pagina-${n}.png`);
export const BAD_IMAGE = path.join(FIXTURES, 'no-es-imagen.png');

const HEADERS = { 'X-Requested-With': 'ocryon' };
let seq = 0;

/** Crea un usuario nuevo por API (la cookie de sesión queda en el contexto del navegador). */
export async function signUp(page: Page, name = 'Ana Prueba') {
  const email = `e2e-${Date.now()}-${++seq}@example.com`;
  const password = 'secreto123';
  const res = await page.request.post('/api/auth/register', { headers: HEADERS, data: { name, email, password, room: 'Sala de Pruebas' } });
  expect(res.status()).toBe(201);
  await approveUser(page, email);
  const login = await page.request.post('/api/auth/login', { headers: HEADERS, data: { email, password } });
  expect(login.ok()).toBeTruthy();
  return { email, password, name };
}

export async function approveUser(page: Page, email: string) {
  const admin = await request.newContext({ baseURL: 'http://localhost:5174' });
  try {
    const credentials = { name: 'Administrador', email: 'admin-e2e@example.com', password: 'secreto123', setupToken: 'e2e-setup-token' };
    const setup = await admin.post('/api/auth/setup-admin', { headers: HEADERS, data: credentials });
    if (setup.status() !== 201 && setup.status() !== 409) throw new Error(`Setup admin: ${setup.status()}`);
    await admin.post('/api/auth/login', { headers: HEADERS, data: credentials });
    const list = await admin.get('/api/administration/users', { headers: HEADERS });
    const { users } = await list.json();
    const target = users.find((u: { email: string }) => u.email === email);
    const review = await admin.patch(`/api/administration/users/${target.id}/status`, { headers: HEADERS, data: { status: 'approved' } });
    expect(review.ok()).toBeTruthy();
  } finally { await admin.dispose(); }
}

export async function ensureAdmin(page: Page) {
  const admin = await request.newContext({ baseURL: 'http://localhost:5174' });
  try {
    await admin.post('/api/auth/setup-admin', { headers: HEADERS,
      data: { name: 'Administrador', email: 'admin-e2e@example.com', password: 'secreto123', setupToken: 'e2e-setup-token' } });
  } finally { await admin.dispose(); }
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
