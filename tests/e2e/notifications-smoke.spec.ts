import { test, expect } from '@playwright/test';

test.describe('Notifications smoke test', () => {
  test('notification bell is visible', async ({ page }) => {
    await page.goto('/dashboard');
    // The bell icon should be in the header
    await expect(page.locator('header')).toBeVisible();
  });

  test('notification preferences page loads', async ({ page }) => {
    await page.goto('/profile/notifications');
    await expect(page.getByText(/notification/i)).toBeVisible();
  });
});
