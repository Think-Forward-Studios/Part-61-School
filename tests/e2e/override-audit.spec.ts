import { test, expect } from '@playwright/test';

test.describe('SYL-17: Management override audit trail', () => {
  test('override page loads and audit log is accessible', async ({ page }) => {
    // Navigate to overrides page
    await page.goto('/admin/overrides');
    await expect(page).toHaveURL(/overrides/);

    // Navigate to audit log
    await page.goto('/admin/audit/logs');
    await expect(page.locator('h1')).toContainText(/audit/i);

    // Management override recording + audit trail surfacing is verified
    // by the Phase 6 RLS tests. This E2E test confirms both UIs load.
  });
});
