# Partner-School Onboarding Runbook

**Audience:** Part 61 flight school owner, chief flight instructor, or technical lead responsible for standing up a new school on the app.

**Goal:** Stand up a fully functional instance of the app for a new school on a fresh Supabase project, ready for real student and instructor use.

**Time estimate:**

- First school: 2–3 hours
- Subsequent schools on an existing deployment: ~30 minutes

---

## Prerequisites

Before starting, make sure you have:

- [ ] A **Supabase** account — https://supabase.com (free tier is sufficient for beta)
- [ ] A **Resend** account — https://resend.com (free tier: 3,000/month, 100/day, sufficient for beta)
- [ ] A **sending domain** — e.g. `school.example.com` — with DNS registrar access for DKIM + SPF records
- [ ] **Git + GitHub** access to the Part 61 School repository
- [ ] **Node.js 22+** and **pnpm 9+** on your local machine (or deploy host)
- [ ] A hosting target — **Vercel** is recommended for Next.js; any Node 22 host works

Optional:

- A domain for the app itself (e.g. `app.school.example.com`) — if different from the email sending domain

---

## Part A — Supabase project setup

1. **Create the project.** Go to https://supabase.com/dashboard/new and create a new project. Pick a region close to your school; set a strong database password and store it in your password manager.
2. **Copy database credentials.** Under **Settings → Database → Connection string**, copy:
   - The **Transaction pooler** URL (port 6543) → paste later into `DATABASE_URL`
   - The **Session/Direct** URL (port 5432) → paste later into `DIRECT_DATABASE_URL`
3. **Copy API credentials.** Under **Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠ keep secret — this bypasses RLS)
4. **Enable extensions.** Under **Database → Extensions**, enable:
   - `pg_cron` — reservation reminders, dispatch cues, cost rollups
   - `pg_net` — async email outbox drain
   - `btree_gist` — reservation exclusion constraints
   - `uuid-ossp` — UUID generation
   - `postgis` — optional; only if using geofence (Phase 7)
5. **Configure auth URLs.** Under **Authentication → URL Configuration**:
   - Set **Site URL** to your production URL (e.g. `https://app.school.example.com`)
   - Add local dev URL as an additional redirect URL: `http://localhost:3000`
6. **Enable Realtime for notifications + messaging.** Run in Supabase SQL Editor:
   ```sql
   alter publication supabase_realtime add table public.notification;
   alter publication supabase_realtime add table public.message;
   alter publication supabase_realtime add table public.broadcast;
   ```
7. **Seed pg_cron secret.** Pick a long random string (64+ chars). Run in the SQL Editor:
   ```sql
   alter system set app.internal_worker_secret = '<your-random-secret>';
   select pg_reload_conf();
   ```
   Keep this value — you will also place it in your app's `INTERNAL_WORKER_SECRET` env var (Part C).

---

## Part B — Resend email setup

1. **Sign up** at https://resend.com.
2. Under **Domains**, click **Add Domain** and enter your sending domain (e.g. `school.example.com`).
3. Resend gives you DKIM + SPF DNS records. Go to your DNS registrar and add:
   - 1 TXT record for SPF
   - 2 (or 3) CNAME records for DKIM
4. Wait for verification. DNS propagation is usually < 15 minutes; Resend auto-polls.
5. Under **API Keys**, click **Create API Key**. Copy the key → `RESEND_API_KEY`.
6. Set `RESEND_FROM_EMAIL=noreply@school.example.com` (or whatever sending address you want).

---

## Part C — Application deploy

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/part-61-school.git
   cd part-61-school
   pnpm install --frozen-lockfile
   ```
2. **Copy env template:**
   ```bash
   cp .env.example .env.local
   ```
3. **Fill in `.env.local`** with the values you collected:
   ```
   DATABASE_URL=postgresql://postgres:...@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   DIRECT_DATABASE_URL=postgresql://postgres:...@db.abcdefghij.supabase.co:5432/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefghij.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   RESEND_API_KEY=re_xxx
   RESEND_FROM_EMAIL=noreply@school.example.com
   INTERNAL_WORKER_SECRET=<the same 64-char random string you set in Part A step 7>
   NEXT_PUBLIC_SITE_URL=https://app.school.example.com
   ```
4. **Apply migrations:**
   ```bash
   pnpm --filter @part61/db exec drizzle-kit migrate
   ```
   This creates all tables, RLS policies, triggers, and seeds the AC 61-65 endorsement catalog + 3 system syllabus templates (PPL, IR, CSEL).
5. **Verify the build:**
   ```bash
   pnpm --filter web build
   ```
6. **Deploy.** For Vercel:
   ```bash
   pnpm dlx vercel
   ```
   Or push to a branch connected to Vercel. Set all env vars from step 3 in the Vercel dashboard. Set Node version to 22.

---

## Part D — First admin user

The app does not have a public "sign up as admin" flow (by design — admins are provisioned by the school owner). Create the first admin manually:

1. In Supabase Studio, go to **Authentication → Users → Add User → Create new user**. Enter the email and a temporary password. Check "Auto-confirm email".
2. Copy the new user's UUID.
3. In the SQL Editor, insert the corresponding `public.users` + `public.user_roles` rows, replacing the placeholders:

   ```sql
   -- First, create the school the admin will own
   insert into public.schools (id, name, timezone)
   values (gen_random_uuid(), 'Example Flight School', 'America/Chicago')
   returning id;
   -- Copy the returned school id.

   -- Create a default base
   insert into public.bases (id, school_id, name, timezone)
   values (gen_random_uuid(), '<school-id>', 'Home Base', 'America/Chicago')
   returning id;

   -- Link the auth user to the app's user table
   insert into public.users (id, school_id, email, full_name, timezone)
   values ('<auth-user-id>', '<school-id>', 'admin@school.example.com', 'Admin Name', 'America/Chicago');

   -- Grant admin role
   insert into public.user_roles (user_id, school_id, role)
   values ('<auth-user-id>', '<school-id>', 'admin');

   -- Seed roles[] into JWT metadata so the active-role cookie resolves correctly on first login
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"roles":["admin"]}'::jsonb
   where id = '<auth-user-id>';
   ```

4. Log in at `https://app.school.example.com/login` with the email + temporary password. You should land on `/admin/dashboard`.

---

## Part E — School configuration

All steps below are done in the web UI as the admin user.

1. **School settings** — `/admin/school`
   - Confirm school name, primary timezone, default base.
   - Set operating hours (affects scheduling UI defaults).
2. **People** — `/admin/people`
   - Add instructors. Capture: CFI cert number, CFII/MEI endorsements, medical class + expiration, BFR date, IPC date, sim authorizations, course authorizations.
   - Add students. Capture: demographic data, emergency contact, TSA citizenship status, airman cert number if any.
   - Add mechanics, with A&P or IA designation.
3. **Aircraft** — `/admin/aircraft`
   - Add each aircraft. Capture: tail number, make/model, equipment list (IFR-equipped, complex, sim type if applicable), home base, photo, initial Hobbs/tach/airframe/per-engine times.
4. **Rates** — `/admin/rates` (new in Phase 8)
   - Configure per-hour rates:
     - Aircraft wet rate per make/model (e.g. "C172: $185/hr")
     - Aircraft dry rate if you rent dry
     - Instructor rate (default + per-instructor overrides)
     - Ground instructor rate
     - Simulator rate
     - Fixed surcharges (e.g. fuel surcharge)
   - Historical cost queries use the rate effective at flight time, so changing a rate today does not rewrite past flights.
5. **Courses** — `/admin/courses`
   - Fork a system template (PPL / IR / CSEL) or author a custom syllabus.
   - Publish a version — students can now be enrolled.
6. **Enrollments** — `/admin/enrollments`
   - Enroll each student in their course version. Assign a primary instructor.
7. **FIF (optional)** — `/admin/fif`
   - Post a welcome notice or any standing notices students must acknowledge before dispatch.

---

## Part F — Smoke test

Run this before inviting real users. Cross-reference [`terminology-review-checklist.md`](./terminology-review-checklist.md) as you go.

1. **Student smoke** — log in as a seeded student; confirm `/dashboard` renders 6 tiles (next reservation, syllabus progress, currency, squawks, documents, upload).
2. **Instructor smoke** — log in as a seeded instructor; confirm 6 tiles render; click **Grade** on a pending row; confirm the grading drawer opens.
3. **Notification smoke** — as student, request a reservation; as instructor, confirm the request. The student should see a new bell notification within ~5 seconds (realtime).
4. **Audit smoke** — as admin, `/admin/audit/logs` → confirm the approval appears with actor email + `before`/`after` diff.
5. **Reports smoke** — as admin, `/admin/reports/fleet-utilization` → download CSV and PDF; open each in Excel/Preview.
6. **Mechanic smoke** — log in as a seeded mechanic; open and resolve a test squawk.
7. **Dispatch smoke** — as admin/instructor, `/dispatch` — confirm the three panels (Currently flying / About to fly / Recently closed) render.
8. **E2E suite (optional)** — on a staging environment, run `pnpm --filter web exec playwright test` — 9 specs × 5 browser projects should all pass.

---

## Part G — Go-live

1. **CFI sign-off.** Have a CFI complete [`docs/terminology-review-checklist.md`](./terminology-review-checklist.md). This is the regulatory gate for beta.
2. **Post a welcome broadcast.** As admin, use the broadcast drawer to send "School is live — please log in and complete your profile."
3. **Invite real users.** From `/admin/people`, click **Invite** next to each user → they receive an email with activation link.
4. **Monitor.** For the first 2 weeks, check `/admin/dashboard` daily — watch:
   - **Workload Monitor** — are any instructors red-flagged (> 30h/week or > 3 pending grades)?
   - **Pending approvals** — is the queue growing?
   - **Overdue aircraft** — dispatch channel should flash if any flight is overdue
5. **Review audit log weekly.** `/admin/audit/logs` with a 7-day window — look for unexpected actors or tables.

---

## Known Limitations (v1 → v2 roadmap)

- **No native mobile app** — v1 is web-only. Mobile browser UX works but is not optimized.
- **No Stripe billing** — cost tracking is informational; no charges are processed. Bill from your existing accounting system using the CSV export.
- **No SMS notifications** — email + in-app only.
- **Single reminder cadence** — 24 hours before reservation. No 1-hour / 15-min reminders yet.
- **Instant email only** — no digest mode (one email per event).
- **Dispatch cues are silent** — flashing row + toast, no audio alert. (Audio can be enabled via the "Enable sound alerts" button on the dispatch page.)
- **Training-record audit is nightly** — exception exceptions surface the next morning, not instantly.

---

## Support + Escalation

- **Bug reports / feature requests:** file a GitHub issue on the repository.
- **Security issues:** email the repo owner directly — do NOT file a public issue.
- **Regulatory questions (Part 61 interpretation):** consult your FSDO. The app does not provide legal advice.

---

## Appendix A — Environment variable reference

| Variable                        | Source                                                   | Purpose                                                         |
| ------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                  | Supabase Settings → Database → Transaction pooler (6543) | App runtime queries (pgBouncer-compatible)                      |
| `DIRECT_DATABASE_URL`           | Supabase Settings → Database → Direct connection (5432)  | Drizzle migrations, DDL only                                    |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Settings → API → Project URL                    | Realtime + auth client                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings → API → anon public                    | Browser-side auth                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Settings → API → service_role                   | Server-side admin ops (bypasses RLS — never expose to browser)  |
| `RESEND_API_KEY`                | Resend → API Keys                                        | Outbound email via Resend                                       |
| `RESEND_FROM_EMAIL`             | You pick                                                 | From header on all notifications                                |
| `INTERNAL_WORKER_SECRET`        | You generate (64+ random chars)                          | pg_cron ↔ Next.js API authentication for the email outbox drain |
| `NEXT_PUBLIC_SITE_URL`          | Your production URL                                      | Absolute links in emails, OAuth redirects                       |
| `ADSB_API_BASE_URL`             | Your existing ADS-B tracker service                      | Phase 7 fleet map (optional)                                    |

---

## Appendix B — Troubleshooting

**Emails are not arriving:**

1. Check Resend dashboard → Logs — is the message listed? If no, the app didn't queue it. Query: `select * from email_outbox order by created_at desc limit 10;` — is the row there with `status='queued'` or `status='failed'`?
2. If `status='failed'`, the `last_error` column has the reason.
3. If `status='queued'` but not sent, pg_net or pg_cron may not be configured. Confirm `alter system set app.internal_worker_secret` ran (Part A step 7) and the cron job is visible: `select * from cron.job where jobname = 'phase8_email_outbox_drain';`
4. Verify the Resend domain is fully verified (green checkmark in Resend dashboard).

**Realtime is not firing (notifications don't appear without refresh):**

1. Confirm the publication includes the table: `select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('notification', 'message', 'broadcast');`
2. Check the browser Network tab for a WebSocket connection to `wss://<project>.supabase.co/realtime/v1/websocket`. If absent, the browser client isn't initializing — confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set at build time, not just runtime.
3. Check for multiple tabs competing — the provider deduplicates channels but excess connections can trip Supabase's per-project limit on the free tier.

**Reservation approval blocks on duty hours that look fine:**

The helper counts clock time between `lower(time_range)` and `upper(time_range)` of every flight reservation the instructor has in the 24 hours ending at the proposed reservation's end. It does NOT subtract lunch breaks, gaps, or ground-only segments.

If an instructor is legitimately under 8 hours of instruction but the helper says 9, check:

- Are any reservations double-booked on the instructor? (They shouldn't be — the exclusion constraint prevents it, but legacy rows from Phase 2 might exist.)
- Are any reservations extremely long because of a bad close-out (e.g. 20 hours because close-out Hobbs was never entered)?

**Reports show 0 rows but data obviously exists:**

- Check the timezone. Reports use UTC day boundaries by default; a flight in Chicago at 7pm CST falls on the next UTC day.
- Check the base filter. If "All bases" shows data but "Home Base" does not, one of your aircraft/users has `base_id = null`.

**Student redirected to `/admin/dashboard` after login:**

Usually means the `part61.active_role` cookie is stale from a previous user on the same browser. The middleware auto-resets this when the cookie's role is not in the current user's `roles[]` JWT claim. If it doesn't self-heal:

- Log out explicitly; it clears the cookie on signout.
- Or open a private/incognito window.

**Migration fails with "extension \"pg_cron\" does not exist":**

- Free-tier Supabase projects need `pg_cron` enabled via dashboard first (Part A step 4). It is not enabled by default.

---

## Appendix C — Post-onboarding checklist (for your records)

- [ ] Supabase project created and credentials captured
- [ ] Resend domain verified and API key captured
- [ ] `.env.local` fully populated
- [ ] Migrations applied cleanly
- [ ] `pg_cron` secret seeded
- [ ] First admin user created and logged in successfully
- [ ] School settings configured
- [ ] Rates configured (at least wet + instructor)
- [ ] At least 1 instructor + 1 student + 1 aircraft seeded
- [ ] Smoke test Part F passes
- [ ] CFI sign-off on terminology review checklist
- [ ] Welcome broadcast posted
- [ ] First real-user invites sent
