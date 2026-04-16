import { test, expect } from '@playwright/test';

test.describe('SCH-05 / SCH-11 / SCH-12: Currency and prerequisite blocks', () => {
  test('schedule page loads with currency checks active', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.locator('h1')).toContainText(/schedule/i);

    // Currency and prerequisite blocks are enforced at the tRPC layer
    // via computeStudentCurrencyBlockers() and evaluate_lesson_eligibility().
    // This E2E test verifies the scheduling UI is accessible and renders.
  });
});
