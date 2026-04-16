import { test, expect } from '@playwright/test';

const REPORT_SLUGS = [
  'fleet-utilization',
  'instructor-utilization',
  'student-progress',
  'no-show-rate',
  'squawk-turnaround',
  'course-completion',
];

test.describe('Reports smoke test', () => {
  test('reports index lists all 6 reports', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.getByText('Fleet Utilization')).toBeVisible();
    await expect(page.getByText('Instructor Utilization')).toBeVisible();
    await expect(page.getByText('Student Progress')).toBeVisible();
    await expect(page.getByText('No-Show Rate')).toBeVisible();
    await expect(page.getByText('Squawk Turnaround')).toBeVisible();
    await expect(page.getByText('Course Completion')).toBeVisible();
  });

  for (const slug of REPORT_SLUGS) {
    test(`${slug} page renders`, async ({ page }) => {
      await page.goto(`/admin/reports/${slug}`);
      // Should have date filter inputs
      await expect(page.locator('input[type="date"]').first()).toBeVisible();
    });
  }

  test('CSV export returns 200 with text/csv', async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const resp = await request.get(
      `/admin/reports/fleet-utilization/export.csv?from=${thirtyDaysAgo}&to=${today}`,
    );
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('text/csv');
  });

  test('non-admin gets 403 on CSV export', async ({ browser }) => {
    // Create a fresh context without admin auth
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const resp = await page.goto(
      '/admin/reports/fleet-utilization/export.csv?from=2026-01-01&to=2026-12-31',
    );
    // Should redirect to login or return 403
    // (the page may redirect to /login instead of 403 depending on middleware)
    expect(resp?.status() === 403 || page.url().includes('/login')).toBeTruthy();
    await ctx.close();
  });
});
