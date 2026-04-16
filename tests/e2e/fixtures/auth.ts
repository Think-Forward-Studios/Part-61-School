/**
 * Auth + navigation helpers for E2E tests.
 */

/** Wait for the page to be fully loaded (no pending network requests). */
export async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
}

/** Navigate and wait for load. */
export async function navigateTo(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
}
