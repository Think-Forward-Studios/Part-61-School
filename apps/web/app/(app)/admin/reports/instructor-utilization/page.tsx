'use client';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { ReportShell } from '../_components/ReportShell';
import { BaseFilter } from '../_components/BaseFilter';
import { DateRangeFilter } from '../_components/DateRangeFilter';

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function InstructorUtilizationPage() {
  const params = useSearchParams();
  const baseId = params.get('base_id') ?? undefined;
  const from = params.get('from') ?? defaultFrom();
  const to = params.get('to') ?? defaultTo();
  const q = trpc.reports.instructorUtilization.query.useQuery({ baseId, from, to });

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <ReportShell
        title="Instructor Utilization"
        slug="instructor-utilization"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'scheduledHours', label: 'Scheduled Hours', format: (v) => Number(v).toFixed(1) },
          { key: 'flownHours', label: 'Flown Hours', format: (v) => Number(v).toFixed(1) },
          {
            key: 'passRateFirstAttempt',
            label: 'Pass Rate (1st)',
            format: (v) => (v != null ? (Number(v) * 100).toFixed(0) + '%' : '\u2014'),
          },
          { key: 'workloadWarnings', label: 'Workload Warnings' },
          { key: 'dutyViolations', label: 'Duty Violations' },
        ]}
        rows={(q.data ?? []) as Array<Record<string, unknown>>}
        isLoading={q.isLoading}
        error={q.error?.message ?? null}
        filters={
          <>
            <BaseFilter />
            <DateRangeFilter />
          </>
        }
      />
    </main>
  );
}
