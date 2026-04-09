'use client';

/**
 * VersionTreeEditor — expandable Stage → Phase → Unit → Lesson → LineItem
 * tree. Uses native <details>/<summary> for collapse. All tree mutations
 * gate on `canEdit` (false when published); router + DB trigger are
 * defense-in-depth.
 */
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { lessonKindLabels, type LessonKind } from '@part61/domain';

interface StageRow {
  id: string;
  position: number;
  code: string;
  title: string;
}
interface PhaseRow {
  id: string;
  stageId: string;
  position: number;
  code: string;
  title: string;
}
interface UnitRow {
  id: string;
  stageId: string | null;
  coursePhaseId: string | null;
  position: number;
  code: string;
  title: string;
}
interface LessonRow {
  id: string;
  stageId: string | null;
  coursePhaseId: string | null;
  unitId: string | null;
  position: number;
  code: string;
  title: string;
  kind: string;
}
interface LineItemRow {
  id: string;
  lessonId: string;
  position: number;
  code: string;
  title: string;
  classification: string;
}

interface Props {
  courseId: string;
  versionId: string;
  canEdit: boolean;
  initialStages: StageRow[];
  initialPhases: PhaseRow[];
  initialUnits: UnitRow[];
  initialLessons: LessonRow[];
  initialLineItems: LineItemRow[];
}

const LESSON_KINDS: LessonKind[] = ['ground', 'flight', 'simulator', 'oral', 'written_test'];

export function VersionTreeEditor(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const addStage = trpc.admin.courses.addStage.useMutation();
  const addLesson = trpc.admin.courses.addLesson.useMutation();
  const addLineItem = trpc.admin.courses.addLineItem.useMutation();

  async function onAddStage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await addStage.mutateAsync({
        versionId: props.versionId,
        position: props.initialStages.length,
        code: String(fd.get('code') ?? '').trim(),
        title: String(fd.get('title') ?? '').trim(),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add stage failed');
    }
  }

  async function onAddLesson(stageId: string, position: number, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await addLesson.mutateAsync({
        versionId: props.versionId,
        stageId,
        position,
        code: String(fd.get('code') ?? '').trim(),
        title: String(fd.get('title') ?? '').trim(),
        kind: fd.get('kind') as LessonKind,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add lesson failed');
    }
  }

  async function onAddLineItem(lessonId: string, position: number, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await addLineItem.mutateAsync({
        versionId: props.versionId,
        lessonId,
        position,
        code: String(fd.get('code') ?? '').trim(),
        title: String(fd.get('title') ?? '').trim(),
        classification: (fd.get('classification') as 'required' | 'optional' | 'must_pass') ?? 'required',
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add line item failed');
    }
  }

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2>Tree</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {props.initialStages.length === 0 ? (
        <p style={{ color: '#888' }}>No stages yet.</p>
      ) : null}

      {props.initialStages.map((s) => {
        const stageLessons = props.initialLessons.filter((l) => l.stageId === s.id);
        return (
          <details key={s.id} open style={{ marginBottom: '0.5rem' }}>
            <summary style={{ padding: '0.5rem', background: '#f3f4f6', cursor: 'pointer' }}>
              <strong>Stage {s.position + 1}:</strong> {s.code} — {s.title}{' '}
              {props.canEdit ? null : <span style={{ color: '#888' }}>🔒</span>}
            </summary>
            <div style={{ paddingLeft: '1.5rem', marginTop: '0.25rem' }}>
              {stageLessons.map((l) => {
                const items = props.initialLineItems.filter((li) => li.lessonId === l.id);
                return (
                  <details key={l.id} style={{ marginBottom: '0.25rem' }}>
                    <summary
                      style={{ padding: '0.25rem 0.5rem', background: '#fafafa', cursor: 'pointer' }}
                    >
                      <Link href={`/admin/courses/${props.courseId}/versions/${props.versionId}/lessons/${l.id}`}>
                        Lesson {l.code}
                      </Link>{' '}
                      — {l.title}{' '}
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>
                        ({lessonKindLabels[l.kind as LessonKind]})
                      </span>
                    </summary>
                    <ul style={{ paddingLeft: '1.5rem', marginTop: '0.25rem' }}>
                      {items.map((li) => (
                        <li key={li.id} style={{ fontSize: '0.85rem' }}>
                          {li.code} — {li.title}{' '}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: 3,
                              background:
                                li.classification === 'must_pass'
                                  ? '#fee2e2'
                                  : li.classification === 'optional'
                                    ? '#e0f2fe'
                                    : '#f3f4f6',
                            }}
                          >
                            {li.classification.replace('_', ' ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {props.canEdit ? (
                      <form
                        onSubmit={(e) => onAddLineItem(l.id, items.length, e)}
                        style={{ paddingLeft: '1.5rem', display: 'flex', gap: '0.25rem', fontSize: '0.8rem' }}
                      >
                        <input name="code" placeholder="code" required />
                        <input name="title" placeholder="title" required />
                        <select name="classification" defaultValue="required">
                          <option value="required">required</option>
                          <option value="optional">optional</option>
                          <option value="must_pass">must pass</option>
                        </select>
                        <button type="submit">+ Line item</button>
                      </form>
                    ) : null}
                  </details>
                );
              })}
              {props.canEdit ? (
                <form
                  onSubmit={(e) => onAddLesson(s.id, stageLessons.length, e)}
                  style={{ display: 'flex', gap: '0.25rem', fontSize: '0.85rem', marginTop: '0.5rem' }}
                >
                  <input name="code" placeholder="code" required />
                  <input name="title" placeholder="title" required />
                  <select name="kind" defaultValue="ground">
                    {LESSON_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {lessonKindLabels[k]}
                      </option>
                    ))}
                  </select>
                  <button type="submit">+ Lesson</button>
                </form>
              ) : null}
            </div>
          </details>
        );
      })}

      {props.canEdit ? (
        <form
          onSubmit={onAddStage}
          style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}
        >
          <input name="code" placeholder="Stage code (e.g. S1)" required />
          <input name="title" placeholder="Stage title" required style={{ flex: 1 }} />
          <button type="submit">+ Add stage</button>
        </form>
      ) : null}
    </section>
  );
}
