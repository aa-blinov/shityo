import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const apiPort = process.env.TEST_API_PORT ?? '8000';
const uiPort = process.env.TEST_UI_PORT ?? '5173';
const python = process.env.TEST_PYTHON ?? path.join(repoRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const reuse = process.env.TEST_REUSE_SERVERS !== 'false';

/**
 * E2E прогоняется против собранного фронтенда и живого бэкенда.
 * Бэкенд поднимается автоматически: без него проверять сценарий бессмысленно.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${uiPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Onboarding is marked as seen for the UI origin actually under test:
    // the port is configurable, so the origin cannot be a fixed file entry.
    storageState: {
      cookies: [],
      origins: [`http://localhost:${uiPort}`, `http://127.0.0.1:${uiPort}`].map((origin) => ({
        origin,
        localStorage: [{ name: 'shityo.onboarding.v1', value: 'done' }],
      })),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --app-dir "${path.join(repoRoot, 'backend')}" --port ${apiPort}`,
      cwd: repoRoot,
      env: { CORS_ORIGINS: `http://localhost:${uiPort},http://127.0.0.1:${uiPort}` },
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: process.env.TEST_UI_COMMAND ?? 'npm run start',
      cwd: path.join(repoRoot, 'frontend'),
      url: `http://localhost:${uiPort}`,
      reuseExistingServer: reuse,
      timeout: 120_000,
      env: {
        PORT: uiPort,
        HOST: '127.0.0.1',
        BACKEND_ORIGIN: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
});
