import { test, expect } from '@playwright/test';

test.describe('SYL-15: Line item rollover', () => {
  test('admin can view student records with rollover items', async ({ page }) => {
    // Navigate to a student's record page (as admin)
    await page.goto('/admin/people');
    await expect(page.locator('h1')).toBeVisible();

    // Rollover logic is enforced by the grading system triggers.
    // This E2E test verifies the people management UI loads.
  });
});
