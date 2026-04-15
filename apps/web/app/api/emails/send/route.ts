/**
 * Email worker route handler — drains public.email_outbox via
 * FOR UPDATE SKIP LOCKED and sends each row through Resend.
 *
 * Run by the pg_cron job `phase8_email_outbox_drain` (migration 0035)
 * which calls `net.http_post` against this URL every minute. Can also
 * be called manually for local-dev flushing or from a webhook trigger.
 *
 * Authentication:
 *   Requires the `x-internal-secret` header to match the
 *   `INTERNAL_WORKER_SECRET` env var. Without that match the handler
 *   returns 403 — the cron job and any other caller supplies the
 *   matching secret via `app.internal_worker_secret` session setting
 *   on the database side.
 *
 * Runtime:
 *   `nodejs` because @react-email/render needs Node APIs that Edge
 *   doesn't expose. Also uses `postgres` (pg driver) via
 *   DIRECT_DATABASE_URL — the transaction-mode pooler on :6543 can't
 *   hold FOR UPDATE locks across round trips safely.
 */
import postgres, { type TransactionSql } from 'postgres';
import { render } from '@react-email/render';
import { Resend } from 'resend';

import { loadEmailTemplate } from '@/emails/_loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  template_key: string;
  template_props: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
}

const MAX_BATCH = 50;
const MAX_ATTEMPTS = 5;

function getPgClient() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DIRECT_DATABASE_URL (or DATABASE_URL) required');
  return postgres(url, { prepare: false, max: 2 });
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY required');
  return new Resend(apiKey);
}

export async function POST(req: Request) {
  const secretHeader = req.headers.get('x-internal-secret');
  const expected = process.env.INTERNAL_WORKER_SECRET;
  if (!expected || secretHeader !== expected) {
    return new Response('forbidden', { status: 403 });
  }

  const sqlClient = getPgClient();
  let resend: Resend;
  try {
    resend = getResendClient();
  } catch (e) {
    await sqlClient.end({ timeout: 5 });
    return Response.json({ processed: 0, error: (e as Error).message }, { status: 500 });
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Part 61 School <onboarding@resend.dev>';

  let processed = 0;
  let failed = 0;

  try {
    // Use a single transaction so FOR UPDATE SKIP LOCKED is held for
    // the duration of our claim + send. postgres-js `.begin()` opens
    // a BEGIN/COMMIT block.
    await sqlClient.begin(async (tx: TransactionSql) => {
      const rows = (await tx`
        select id, to_email, subject, template_key, template_props,
               idempotency_key, attempts
          from public.email_outbox
         where status = 'pending'
           and attempts < ${MAX_ATTEMPTS}
         order by created_at asc
         limit ${MAX_BATCH}
         for update skip locked
      `) as unknown as OutboxRow[];

      for (const row of rows) {
        // Mark sending (still inside the same tx so other workers skip).
        await tx`
          update public.email_outbox
             set status = 'sending', attempts = attempts + 1
           where id = ${row.id}
        `;

        try {
          const element = loadEmailTemplate(row.template_key, row.template_props);
          const html = await render(element);

          await resend.emails.send({
            from: fromEmail,
            to: row.to_email,
            subject: row.subject,
            html,
            headers: {
              'X-Entity-Ref-ID': row.idempotency_key,
            },
          });

          await tx`
            update public.email_outbox
               set status = 'sent', sent_at = now()
             where id = ${row.id}
          `;
          processed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTerminal = row.attempts + 1 >= MAX_ATTEMPTS;
          await tx`
            update public.email_outbox
               set status = ${isTerminal ? 'failed' : 'pending'},
                   failed_at = case when ${isTerminal} then now() else failed_at end,
                   error_message = ${message}
             where id = ${row.id}
          `;
          failed++;
        }
      }
    });
  } catch (err) {
    await sqlClient.end({ timeout: 5 });
    return Response.json({ processed, failed, error: (err as Error).message }, { status: 500 });
  }

  await sqlClient.end({ timeout: 5 });
  return Response.json({ processed, failed });
}
