import { test, expect } from '@playwright/test';

test('app loads with Life Map branding and core UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Life Map');
  await expect(page.locator('header img[alt="Life Map"]')).toBeVisible();
  // the MapLibre canvas mounts (independent of tiles actually loading)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
});

test('language toggle switches UI to English', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export image' })).toBeVisible();
});
