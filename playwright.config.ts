import { defineConfig, devices } from '@playwright/test';

// Smoke e2e: boots the web dev server (it serves the bundled data statically; the
// /api proxy may be down — the app degrades gracefully) and checks the app renders.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -w apps/web',
    url: 'http://localhost:5173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
