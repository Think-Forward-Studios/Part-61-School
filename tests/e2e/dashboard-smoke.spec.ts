import { test, expect } from '@playwright/test';

test.describe('Dashboard smoke test', () => {
  test('student dashboard shows 6 tiles', async ({ page }) => {
    await page.goto('/dashboard');
    // Student tiles
    await expect(page.getByText('Next Reservation')).toBeVisible();
    await expect(page.getByText('Syllabus Progress')).toBeVisible();
    await expect(page.getByText('Currency Status')).toBeVisible();
    await expect(page.getByText('Aircraft Squawks')).toBeVisible();
    await expect(page.getByText('Documents')).toBeVisible();
    await expect(page.getByText('Upload Document')).toBeVisible();
  });
});

test.describe('Admin dashboard smoke', () => {
  test('admin dashboard shows workload monitor', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.getByText('Instructor Workload')).toBeVisible();
  });
});
