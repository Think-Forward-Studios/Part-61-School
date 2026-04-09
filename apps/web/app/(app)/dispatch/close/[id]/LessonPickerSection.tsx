'use client';

/**
 * LessonPickerSection — Phase 5 dispatch close-out (SYL-06/07).
 *
 * Given the student's active enrollment + its course_version, fetches
 * the full tree and lets the instructor pick a lesson. On pick, calls
 * gradeSheet.createFromReservation and mounts GradeSheetEditor.
 *
 * Note: the underlying admin.courses.getVersion procedure is gated to
 * adminOrChiefInstructor. Regular instructors without the chief flag
 * will see a load error here — a dedicated instructor read procedure is
 * tracked as a follow-up.
 */
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { lessonKindLabels, type LessonKind } from '@part61/domain';
import { GradeSheetEditor } from './GradeSheetEditor';

interface ExistingSheet {
  id: string;
  lessonId: string;
  lessonCode: string;
  lessonTitle: string;
  status: string;
  sealed: boolean;
}

interface Props {
  reservationId: string;
  studentEnrollmentId: string;
  courseVersionId: string;
  existingSheets: ExistingSheet[];
}

export function LessonPickerSection({
  reservationId,
  studentEnrollmentId,
  courseVersionId,
  existingSheets,
}: Props) {
  const versionQ = trpc.admin.courses.getVersion.useQuery({ versionId: courseVersionId });
  const create = trpc.gradeSheet.createFromReservation.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(
    existingSheets[0]?.id ?? null,
  );
  // Local cache of sheets created this session
  const [createdSheets, setCreatedSheets] = useState<ExistingSheet[]>([]);

  const allSheets = useMemo(
    () => [...existingSheets, ...createdSheets],
    [existingSheets, createdSheets],
  );

  const gradingScale = versionQ.data?.version.gradingScale ?? 'absolute_ipm';
  const lessons = versionQ.data?.lessons ?? [];

  async function onPick(lessonId: string) {
    setError(null);
    try {
      const sheet = await create.mutateAsync({
        reservationId,
        lessonId,
        studentEnrollmentId,
      });
      const l = lessons.find((x) => x.id === lessonId);
      if (sheet?.id && l) {
        const row: ExistingSheet = {
          id: sheet.id,
          lessonId,
          lessonCode: l.code,
          lessonTitle: l.title,
          status: 'draft',
          sealed: false,
        };
        setCreatedSheets((prev) => [...prev, row]);
        setActiveSheetId(sheet.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create grade sheet failed');
    }
  }

  return (
    <section
      style={{
        marginTop: '1.5rem',
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: 6,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Grade lesson</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {allSheets.length > 0 ? (
        <div style={{ marginBottom: '1rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Grade sheets on this reservation:</strong>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.25rem' }}>
            {allSheets.map((s) => (
              <li key={s.id} style={{ padding: '0.25rem 0' }}>
                <button
                  type="button"
                  onClick={() => setActiveSheetId(s.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: activeSheetId === s.id ? '#eff6ff' : 'white',
                    border: '1px solid #ddd',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  {s.lessonCode} — {s.lessonTitle}
                  {s.sealed ? ' 🔒' : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!activeSheetId ? (
        versionQ.isLoading ? (
          <p style={{ color: '#888' }}>Loading lessons…</p>
        ) : versionQ.error ? (
          <p style={{ color: 'crimson' }}>
            Unable to load course version: {versionQ.error.message}
          </p>
        ) : lessons.length === 0 ? (
          <p style={{ color: '#888' }}>This course version has no lessons.</p>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              Pick a lesson to grade:
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) onPick(e.target.value);
              }}
              defaultValue=""
              disabled={create.isPending}
            >
              <option value="">— select —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.title} ({lessonKindLabels[l.kind as LessonKind]})
                </option>
              ))}
            </select>
          </div>
        )
      ) : (
        <>
          <GradeSheetEditor
            gradeSheetId={activeSheetId}
            gradingScale={gradingScale as 'absolute_ipm' | 'relative_5' | 'pass_fail'}
          />
          <button
            type="button"
            onClick={() => setActiveSheetId(null)}
            style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}
          >
            + Add another lesson
          </button>
        </>
      )}
    </section>
  );
}
