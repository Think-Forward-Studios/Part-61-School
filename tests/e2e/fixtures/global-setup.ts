import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

const TEST_USERS = [
  { slug: 'admin', email: 'admin-a@alpha.test', password: 'admin-passw0rd' },
  { slug: 'instructor', email: 'e2e-instructor@alpha.test', password: 'instr-passw0rd' },
  { slug: 'student', email: 'student1@alpha.test', password: 'student-passw0rd' },
];

async function ensureAuthUser(email: string, password: string, id?: string) {
  // Try to create, ignore if exists
  const body: Record<string, unknown> = { email, password, email_confirm: true };
  if (id) body.id = id;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export default async function globalSetup(_config: FullConfig) {
  // Ensure auth dir exists
  const authDir = path.join(__dirname, '..', '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  // Ensure fixture dir exists
  const fixtureDir = path.join(__dirname, '..', '.fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });

  // Ensure test auth users exist
  for (const user of TEST_USERS) {
    await ensureAuthUser(user.email, user.password);
  }

  // Sign in each user and cache storageState
  const browser = await chromium.launch();
  for (const user of TEST_USERS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      // Wait for redirect away from login
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
      await page.waitForTimeout(1000); // let cookies settle
      await context.storageState({ path: path.join(authDir, `${user.slug}.json`) });
    } catch (err) {
      console.warn(`[global-setup] Failed to login as ${user.slug}: ${err}`);
    } finally {
      await context.close();
    }
  }
  await browser.close();

  // Write test data IDs for specs to use
  const [admin, instructor, student] = TEST_USERS;
  const testData = {
    schoolId: '11111111-1111-1111-1111-111111111111',
    adminEmail: admin?.email ?? '',
    instructorEmail: instructor?.email ?? '',
    studentEmail: student?.email ?? '',
  };
  fs.writeFileSync(path.join(fixtureDir, 'test-data.json'), JSON.stringify(testData, null, 2));
}
