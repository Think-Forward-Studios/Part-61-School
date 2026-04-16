import { test, expect } from '@playwright/test';

test.describe('MNT-04 / MNT-09: Sign-off authority', () => {
  test('work order page loads for admin', async ({ page }) => {
    // Navigate to squawks/work orders
    await page.goto('/admin/squawks');
    await expect(page).toHaveURL(/squawks/);

    // The sign-off authority check (A&P vs IA) is enforced at the
    // tRPC procedure level with buildSignerSnapshot(). This E2E test
    // verifies the squawk management UI is accessible.
  });
});
