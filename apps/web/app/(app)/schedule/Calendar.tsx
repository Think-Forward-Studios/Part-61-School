'use client';

/**
 * FullCalendar React wrapper (SCH-07, SCH-17).
 *
 * MIT plugins only: dayGrid, timeGrid, interaction. `resource-timeline`
 * is a paid plugin and is NOT used. For per-resource views ("by
 * aircraft" / "by instructor" / "by room" / "by student") we fall back
 * to a client-side resource filter that narrows the timeGrid to events
 * matching the selected resource. Full multi-resource grid is deferred.
 *
 * Status visuals:
 *   requested          → dashed outline
 *   approved           → solid fill (Confirmed)
 *   dispatched         → bold outline
 *   flown / closed     → check icon suffix
 *   cancelled_* /
 *   no_show / scrubbed → strikethrough
 */
import { useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import type { EventInput, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  activityTypeColor,
  reservationStatusLabel,
  RES_STATUS,
} from '@part61/domain';
import { trpc } from '@/lib/trpc/client';
import { ReservationDrawer } from './ReservationDrawer';

type RawReservation = {
  id: string;
  activity_type?: string;
  activityType?: string;
  status: string;
  time_range?: string;
  timeRange?: string;
  aircraft_id?: string | null;
  aircraftId?: string | null;
  instructor_id?: string | null;
  instructorId?: string | null;
  student_id?: string | null;
  studentId?: string | null;
  room_id?: string | null;
  roomId?: string | null;
  notes?: string | null;
};

export type CalendarMode = 'mine' | 'full';

export type CalendarProps = {
  mode: CalendarMode;
  initialRows: RawReservation[];
  resources?: {
    aircraft: Array<{ id: string; label: string }>;
    instructors: Array<{ id: string; label: string }>;
    rooms: Array<{ id: string; label: string }>;
  };
};

function parseRangeLiteral(range: string): { start: Date; end: Date } | null {
  // Accept both `[2026-05-01 14:00:00+00,2026-05-01 15:00:00+00)` and
  // quoted-bound variant. Expand abbreviated `+HH` offset to `+HH:00`.
  const m = range.match(/^[\[(]\s*"?([^",]+)"?\s*,\s*"?([^"\)]+)"?\s*[\])]$/);
  if (!m) return null;
  const norm = (s: string) =>
    s.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const start = new Date(norm(m[1]!));
  const end = new Date(norm(m[2]!));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function pick<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v != null) return v;
  return null;
}

function toEvent(row: RawReservation): EventInput | null {
  const range = row.time_range ?? row.timeRange;
  if (!range) return null;
  const parsed = parseRangeLiteral(range);
  if (!parsed) return null;
  const activity = (row.activity_type ?? row.activityType ?? 'misc') as string;
  const color = activityTypeColor(activity);
  const status = row.status;

  const isCancelled =
    status === RES_STATUS.CANCELLED ||
    status === RES_STATUS.NO_SHOW ||
    status === RES_STATUS.SCRUBBED;
  const isDone = status === RES_STATUS.FLOWN || status === RES_STATUS.CLOSED;

  let borderColor = color;
  let backgroundColor = color;
  let textColor = 'white';
  let classNames: string[] = ['p61-event', `p61-status-${status}`];

  if (isPendingFn(status)) {
    backgroundColor = 'transparent';
    textColor = color;
    classNames.push('p61-dashed');
  } else if (status === RES_STATUS.DISPATCHED) {
    classNames.push('p61-bold');
  } else if (isCancelled) {
    backgroundColor = '#e5e7eb';
    textColor = '#6b7280';
    borderColor = '#9ca3af';
    classNames.push('p61-strike');
  }

  const statusLabel = reservationStatusLabel(status);
  const doneMark = isDone ? ' ✓' : '';

  return {
    id: row.id,
    start: parsed.start.toISOString(),
    end: parsed.end.toISOString(),
    title: `${activity} · ${statusLabel}${doneMark}`,
    backgroundColor,
    borderColor,
    textColor,
    classNames,
    extendedProps: {
      activity,
      status,
      aircraftId: pick(row.aircraft_id, row.aircraftId),
      instructorId: pick(row.instructor_id, row.instructorId),
      studentId: pick(row.student_id, row.studentId),
      roomId: pick(row.room_id, row.roomId),
      notes: row.notes ?? null,
    },
  };
}

function isPendingFn(s: string): boolean {
  return s === RES_STATUS.REQUESTED;
}

type ResourceKind = 'all' | 'aircraft' | 'instructor' | 'student' | 'room';

export function Calendar({ mode, initialRows, resources }: CalendarProps) {
  const router = useRouter();
  const calRef = useRef<FullCalendar | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resKind, setResKind] = useState<ResourceKind>('all');
  const [resId, setResId] = useState<string>('');

  const listQuery = trpc.schedule.list.useQuery(
    { mode },
    {
      initialData: { mode, rows: initialRows } as never,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  );

  const rows: RawReservation[] = useMemo(() => {
    const data = listQuery.data as unknown as
      | { rows?: RawReservation[] }
      | undefined;
    return data?.rows ?? initialRows ?? [];
  }, [listQuery.data, initialRows]);

  const events: EventInput[] = useMemo(() => {
    const all = rows
      .map(toEvent)
      .filter((e): e is EventInput => e !== null);
    if (resKind === 'all' || !resId) return all;
    const key: keyof RawReservation =
      resKind === 'aircraft'
        ? 'aircraftId'
        : resKind === 'instructor'
          ? 'instructorId'
          : resKind === 'student'
            ? 'studentId'
            : 'roomId';
    const altKey: keyof RawReservation =
      resKind === 'aircraft'
        ? 'aircraft_id'
        : resKind === 'instructor'
          ? 'instructor_id'
          : resKind === 'student'
            ? 'student_id'
            : 'room_id';
    return all.filter((e) => {
      const ext = (e.extendedProps ?? {}) as Record<string, unknown>;
      // Also check original row by id to catch either field casing
      const row = rows.find((r) => r.id === e.id);
      if (!row) return false;
      const v = (row[key] ?? row[altKey]) as string | null | undefined;
      const extV =
        key === 'aircraftId'
          ? ext.aircraftId
          : key === 'instructorId'
            ? ext.instructorId
            : key === 'studentId'
              ? ext.studentId
              : ext.roomId;
      return v === resId || extV === resId;
    });
  }, [rows, resKind, resId]);

  const resourceList = useMemo(() => {
    if (!resources) return [];
    if (resKind === 'aircraft') return resources.aircraft;
    if (resKind === 'instructor') return resources.instructors;
    if (resKind === 'room') return resources.rooms;
    return [];
  }, [resources, resKind]);

  function onEventClick(arg: EventClickArg) {
    setSelectedId(arg.event.id);
  }

  function onSelect(arg: DateSelectArg) {
    const qs = new URLSearchParams({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    });
    router.push(`/schedule/request?${qs.toString()}`);
  }

  return (
    <div>
      <style>{`
        .p61-event.p61-dashed { border-style: dashed !important; border-width: 2px !important; }
        .p61-event.p61-bold { border-width: 3px !important; }
        .p61-event.p61-strike { text-decoration: line-through !important; opacity: 0.65; }
      `}</style>
      {resources && mode === 'full' ? (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <label>
            View by{' '}
            <select
              value={resKind}
              onChange={(e) => {
                const v = e.target.value as ResourceKind;
                setResKind(v);
                setResId('');
              }}
            >
              <option value="all">All</option>
              <option value="aircraft">Aircraft</option>
              <option value="instructor">Instructor</option>
              <option value="room">Room</option>
            </select>
          </label>
          {resKind !== 'all' && resourceList.length > 0 ? (
            <label>
              Resource{' '}
              <select
                value={resId}
                onChange={(e) => setResId(e.target.value)}
              >
                <option value="">— select —</option>
                {resourceList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={events}
        selectable
        selectMirror
        select={onSelect}
        eventClick={onEventClick}
        height="auto"
        nowIndicator
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
      />

      {selectedId ? (
        <ReservationDrawer
          reservationId={selectedId}
          onClose={() => setSelectedId(null)}
          canConfirm={mode === 'full'}
        />
      ) : null}
    </div>
  );
}
