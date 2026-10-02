import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Puertos propios para no chocar con un `npm run dev` que ya esté abierto.
const API_PORT = 3101;
const WEB_PORT = 5174;
const MOCK_PORT = 4010;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-ES',
    timezoneId: 'America/Lima',
    permissions: ['camera', 'clipboard-read', 'clipboard-write'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: [
    { command: 'node e2e/mock-providers.mjs', port: MOCK_PORT, env: { MOCK_PORT: String(MOCK_PORT) } },
    {
      command: 'npm run dev -w @ocryon/server',
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        AUTH_RATE_LIMIT: '10000',
        // PostgreSQL embebido (PGlite) en una carpeta temporal: cada ejecución empieza de cero.
        DATA_DIR: path.join(os.tmpdir(), `ocryon-e2e-${Date.now()}`),
        OCRSPACE_ENDPOINT: `http://localhost:${MOCK_PORT}/parse/image`,
        GEMINI_API_BASE: `http://localhost:${MOCK_PORT}/v1beta`,
      },
    },
    {
      command: `npm run dev -w @ocryon/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT) },
    },
  ],
});
