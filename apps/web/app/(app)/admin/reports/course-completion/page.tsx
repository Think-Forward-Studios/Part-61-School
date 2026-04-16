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

export default function CourseCompletionPage() {
  const params = useSearchParams();
  const baseId = params.get('base_id') ?? undefined;
  const from = params.get('from') ?? defaultFrom();
  const to = params.get('to') ?? defaultTo();
  const q = trpc.reports.courseCompletion.query.useQuery({ baseId, from, to });

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <ReportShell
        title="Course Completion"
        slug="course-completion"
        columns={[
          { key: 'courseName', label: 'Course' },
          { key: 'versionLabel', label: 'Version' },
          { key: 'enrolled', label: 'Enrolled' },
          { key: 'completed', label: 'Completed' },
          {
            key: 'completionRatePct',
            label: 'Completion Rate',
            format: (v) => Number(v).toFixed(1) + '%',
          },
          {
            key: 'avgDaysToComplete',
            label: 'Avg Days',
            format: (v) => Number(v).toFixed(0) + ' days',
          },
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
