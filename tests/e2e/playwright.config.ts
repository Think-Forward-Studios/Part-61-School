import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { outputFolder: '../../apps/web/playwright-report' }], ['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  globalSetup: require.resolve('./fixtures/global-setup'),
  projects: [
    {
      name: 'chromium-admin',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/admin.json' },
    },
    {
      name: 'chromium-instructor',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/instructor.json' },
    },
    {
      name: 'chromium-student',
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/student.json' },
    },
    {
      name: 'firefox-admin',
      use: { ...devices['Desktop Firefox'], storageState: 'tests/e2e/.auth/admin.json' },
    },
    {
      name: 'webkit-admin',
      use: { ...devices['Desktop Safari'], storageState: 'tests/e2e/.auth/admin.json' },
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
