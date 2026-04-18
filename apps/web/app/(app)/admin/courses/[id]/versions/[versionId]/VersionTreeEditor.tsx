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

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontFamily: '"Antonio", system-ui, sans-serif',
  fontSize: '1.05rem',
  letterSpacing: '0.02em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

const INPUT: React.CSSProperties = {
  padding: '0.35rem 0.6rem',
  background: '#121826',
  border: '1px solid #1f2940',
  borderRadius: 6,
  color: '#f7f9fc',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
};

const SELECT: React.CSSProperties = {
  ...INPUT,
  padding: '0.35rem 0.4rem',
};

const ADD_BTN: React.CSSProperties = {
  padding: '0.35rem 0.8rem',
  background: 'rgba(52, 211, 153, 0.12)',
  color: '#34d399',
  border: '1px solid rgba(52, 211, 153, 0.35)',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
};

const SUMMARY_STAGE: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  background: '#121826',
  border: '1px solid #1f2940',
  borderRadius: 8,
  cursor: 'pointer',
  color: '#f7f9fc',
  listStyle: 'none',
};

const SUMMARY_LESSON: React.CSSProperties = {
  padding: '0.4rem 0.7rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 6,
  cursor: 'pointer',
  color: '#cbd5e1',
  listStyle: 'none',
};

const CHIP_CLASSIFICATION = (cls: string): React.CSSProperties => {
  const base: React.CSSProperties = {
    fontSize: '0.66rem',
    padding: '0.1rem 0.45rem',
    borderRadius: 999,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginLeft: '0.4rem',
  };
  if (cls === 'must_pass') {
    return {
      ...base,
      background: 'rgba(248, 113, 113, 0.12)',
      color: '#f87171',
      border: '1px solid rgba(248, 113, 113, 0.35)',
    };
  }
  if (cls === 'optional') {
    return {
      ...base,
      background: 'rgba(56, 189, 248, 0.12)',
      color: '#38bdf8',
      border: '1px solid rgba(56, 189, 248, 0.35)',
    };
  }
  return {
    ...base,
    background: 'rgba(122, 134, 154, 0.14)',
    color: '#cbd5e1',
    border: '1px solid #1f2940',
  };
};

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
        classification:
          (fd.get('classification') as 'required' | 'optional' | 'must_pass') ?? 'required',
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add line item failed');
    }
  }

  return (
    <section
      style={{
        marginTop: '1.5rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <h2 style={SECTION_HEADING}>Tree</h2>
      {error ? <p style={{ color: '#f87171' }}>{error}</p> : null}

      {props.initialStages.length === 0 ? <p style={{ color: '#7a869a' }}>No stages yet.</p> : null}

      {props.initialStages.map((s) => {
        const stageLessons = props.initialLessons.filter((l) => l.stageId === s.id);
        return (
          <details key={s.id} open style={{ marginBottom: '0.5rem' }}>
            <summary style={SUMMARY_STAGE}>
              <strong style={{ color: '#f7f9fc' }}>Stage {s.position + 1}:</strong>{' '}
              <span
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.85rem',
                  color: '#38bdf8',
                }}
              >
                {s.code}
              </span>{' '}
              — <span style={{ color: '#cbd5e1' }}>{s.title}</span>{' '}
              {props.canEdit ? null : <span style={{ color: '#5b6784' }}>🔒</span>}
            </summary>
            <div style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
              {stageLessons.map((l) => {
                const items = props.initialLineItems.filter((li) => li.lessonId === l.id);
                return (
                  <details key={l.id} style={{ marginBottom: '0.35rem' }}>
                    <summary style={SUMMARY_LESSON}>
                      <Link
                        href={`/admin/courses/${props.courseId}/versions/${props.versionId}/lessons/${l.id}`}
                        style={{
                          color: '#38bdf8',
                          textDecoration: 'none',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.8rem',
                        }}
                      >
                        Lesson {l.code}
                      </Link>{' '}
                      — <span style={{ color: '#f7f9fc' }}>{l.title}</span>{' '}
                      <span style={{ fontSize: '0.75rem', color: '#7a869a' }}>
                        ({lessonKindLabels[l.kind as LessonKind]})
                      </span>
                    </summary>
                    <ul style={{ paddingLeft: '1.25rem', marginTop: '0.35rem' }}>
                      {items.map((li) => (
                        <li
                          key={li.id}
                          style={{ fontSize: '0.82rem', color: '#cbd5e1', margin: '0.15rem 0' }}
                        >
                          <span
                            style={{
                              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                              color: '#7a869a',
                            }}
                          >
                            {li.code}
                          </span>{' '}
                          — {li.title}
                          <span style={CHIP_CLASSIFICATION(li.classification)}>
                            {li.classification.replace('_', ' ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {props.canEdit ? (
                      <form
                        onSubmit={(e) => onAddLineItem(l.id, items.length, e)}
                        style={{
                          paddingLeft: '1.25rem',
                          display: 'flex',
                          gap: '0.35rem',
                          fontSize: '0.8rem',
                          flexWrap: 'wrap',
                          marginTop: '0.25rem',
                        }}
                      >
                        <input name="code" placeholder="code" required style={INPUT} />
                        <input name="title" placeholder="title" required style={INPUT} />
                        <select name="classification" defaultValue="required" style={SELECT}>
                          <option value="required">required</option>
                          <option value="optional">optional</option>
                          <option value="must_pass">must pass</option>
                        </select>
                        <button type="submit" style={ADD_BTN}>
                          + Line item
                        </button>
                      </form>
                    ) : null}
                  </details>
                );
              })}
              {props.canEdit ? (
                <form
                  onSubmit={(e) => onAddLesson(s.id, stageLessons.length, e)}
                  style={{
                    display: 'flex',
                    gap: '0.35rem',
                    fontSize: '0.85rem',
                    marginTop: '0.6rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <input name="code" placeholder="code" required style={INPUT} />
                  <input name="title" placeholder="title" required style={INPUT} />
                  <select name="kind" defaultValue="ground" style={SELECT}>
                    {LESSON_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {lessonKindLabels[k]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={ADD_BTN}>
                    + Lesson
                  </button>
                </form>
              ) : null}
            </div>
          </details>
        );
      })}

      {props.canEdit ? (
        <form
          onSubmit={onAddStage}
          style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
        >
          <input name="code" placeholder="Stage code (e.g. S1)" required style={INPUT} />
          <input
            name="title"
            placeholder="Stage title"
            required
            style={{ ...INPUT, flex: 1, minWidth: 200 }}
          />
          <button type="submit" style={ADD_BTN}>
            + Add stage
          </button>
        </form>
      ) : null}
    </section>
  );
}
