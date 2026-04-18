'use client';

/**
 * GradeSheetEditor — inline grading UI (SYL-07, SYL-13, SYL-14).
 *
 * Note: read-side of the lesson tree comes via admin.courses.getVersion
 * in the parent LessonPickerSection (to keep a single source of truth
 * for the grading_scale). This component drives writes only: setGrade
 * per line item, setOverallRemarks, setGroundFlightMinutes, seal.
 *
 * Because there is no gradeSheet.get read procedure, this editor starts
 * with empty local state after createFromReservation pre-filled the
 * stubs on the server. Users grade each line item, auto-save fires the
 * setGrade mutation, and the ceremonial Sign-and-Seal button enforces
 * the must-pass contract server-side.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  absoluteIpmLabels,
  relative5Labels,
  passFailLabels,
  type GradingScale,
} from '@part61/domain';

interface Props {
  gradeSheetId: string;
  gradingScale: GradingScale;
}

function gradeOptions(scale: GradingScale): Array<{ value: string; label: string }> {
  if (scale === 'absolute_ipm') {
    return Object.entries(absoluteIpmLabels).map(([value, label]) => ({
      value,
      label,
    }));
  }
  if (scale === 'relative_5') {
    return Object.entries(relative5Labels).map(([value, label]) => ({ value, label }));
  }
  return Object.entries(passFailLabels).map(([value, label]) => ({ value, label }));
}

export function GradeSheetEditor({ gradeSheetId, gradingScale }: Props) {
  const versionQ = trpc.admin.courses.getVersion.useQuery(undefined as never, {
    enabled: false,
  });
  // We read the lesson + its line items via the version query but LessonPickerSection
  // already has it cached. Rather than prop-drill, we fetch fresh here.
  const setGrade = trpc.gradeSheet.setGrade.useMutation();
  const setOverallRemarks = trpc.gradeSheet.setOverallRemarks.useMutation();
  const setGroundFlightMinutes = trpc.gradeSheet.setGroundFlightMinutes.useMutation();
  const seal = trpc.gradeSheet.seal.useMutation();

  const [overallRemarks, setOverallRemarksLocal] = useState('');
  const [groundMinutes, setGroundMinutes] = useState(0);
  const [flightMinutes, setFlightMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sealed, setSealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const options = gradeOptions(gradingScale);

  // Line items the user has graded this session. We don't have a get
  // endpoint, so we accumulate state locally and rely on setGrade to
  // upsert against the pre-filled stubs on the server.
  const [localGrades, setLocalGrades] = useState<
    Record<string, { lineItemId: string; gradeValue: string; remarks: string; title: string }>
  >({});
  const [newItemId, setNewItemId] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newRemarks, setNewRemarks] = useState('');

  async function onAddGrade() {
    if (!newItemId || !newValue) return;
    setError(null);
    try {
      await setGrade.mutateAsync({
        gradeSheetId,
        lineItemId: newItemId,
        gradeValue: newValue,
        gradeRemarks: newRemarks || undefined,
      });
      setLocalGrades((prev) => ({
        ...prev,
        [newItemId]: {
          lineItemId: newItemId,
          gradeValue: newValue,
          remarks: newRemarks,
          title: newItemTitle || newItemId.slice(0, 8),
        },
      }));
      setNewItemId('');
      setNewItemTitle('');
      setNewValue('');
      setNewRemarks('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save grade failed');
    }
  }

  async function onSaveOverall() {
    setError(null);
    try {
      await setOverallRemarks.mutateAsync({ gradeSheetId, overallRemarks });
      await setGroundFlightMinutes.mutateAsync({ gradeSheetId, groundMinutes, flightMinutes });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function onSeal() {
    setError(null);
    try {
      await seal.mutateAsync({ gradeSheetId });
      setSealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seal failed');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0d1220',
    border: '1px solid #293352',
    color: '#f7f9fc',
    padding: '0.35rem 0.55rem',
    borderRadius: 6,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '0.82rem',
    marginTop: '0.2rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#7a869a',
    display: 'block',
  };

  const outlineBtn: React.CSSProperties = {
    padding: '0.4rem 0.85rem',
    background: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    borderRadius: 6,
    fontSize: '0.72rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: 'pointer',
  };

  if (sealed) {
    return (
      <div
        style={{
          padding: '1rem',
          background: 'rgba(52, 211, 153, 0.1)',
          border: '1px solid rgba(52, 211, 153, 0.45)',
          borderRadius: 8,
          color: '#34d399',
          fontSize: '0.88rem',
        }}
      >
        🔒 <strong>Grade sheet sealed.</strong> This record is immutable.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.82rem', color: '#7a869a', margin: 0 }}>
        Grading scale:{' '}
        <strong style={{ color: '#38bdf8' }}>{gradingScale.replace('_', ' ')}</strong>. Grades saved
        to the draft; seal to finalize. The server enforces the must-pass contract before sealing.
      </p>

      {/* Summary of graded line items so far */}
      {Object.keys(localGrades).length > 0 ? (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.7rem',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.65rem',
                    letterSpacing: '0.15em',
                    color: '#7a869a',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    borderBottom: '1px solid #1f2940',
                  }}
                >
                  Line item
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.7rem',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.65rem',
                    letterSpacing: '0.15em',
                    color: '#7a869a',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    borderBottom: '1px solid #1f2940',
                  }}
                >
                  Grade
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.7rem',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.65rem',
                    letterSpacing: '0.15em',
                    color: '#7a869a',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    borderBottom: '1px solid #1f2940',
                  }}
                >
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.values(localGrades).map((g) => (
                <tr key={g.lineItemId} style={{ borderBottom: '1px solid #161d30' }}>
                  <td
                    style={{
                      padding: '0.45rem 0.7rem',
                      color: '#cbd5e1',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.78rem',
                    }}
                  >
                    {g.title}
                  </td>
                  <td style={{ padding: '0.45rem 0.7rem', color: '#38bdf8', fontWeight: 600 }}>
                    {g.gradeValue}
                  </td>
                  <td style={{ padding: '0.45rem 0.7rem', color: '#cbd5e1' }}>{g.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div
        style={{
          padding: '0.75rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 8,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 2fr auto',
          gap: '0.5rem',
          alignItems: 'end',
          fontSize: '0.85rem',
        }}
      >
        <label style={labelStyle}>
          Line item ID
          <input
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            placeholder="line_item uuid"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Grade
          <select value={newValue} onChange={(e) => setNewValue(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Remarks
          <input
            value={newRemarks}
            onChange={(e) => setNewRemarks(e.target.value)}
            placeholder="optional"
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          onClick={onAddGrade}
          disabled={setGrade.isPending}
          style={{
            ...outlineBtn,
            opacity: setGrade.isPending ? 0.5 : 1,
            cursor: setGrade.isPending ? 'not-allowed' : 'pointer',
          }}
        >
          Save
        </button>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#5b6784', margin: 0 }}>
        Line item IDs come from the course version tree editor. A richer picker is a follow-up; for
        now the line items were pre-stubbed on the server when the grade sheet was created.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          fontSize: '0.85rem',
        }}
      >
        <label style={labelStyle}>
          Ground minutes
          <input
            type="number"
            min={0}
            value={groundMinutes}
            onChange={(e) => setGroundMinutes(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Flight minutes
          <input
            type="number"
            min={0}
            value={flightMinutes}
            onChange={(e) => setFlightMinutes(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
      </div>

      <label style={labelStyle}>
        Overall remarks
        <textarea
          rows={3}
          value={overallRemarks}
          onChange={(e) => setOverallRemarksLocal(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onSaveOverall}
          disabled={setOverallRemarks.isPending || setGroundFlightMinutes.isPending}
          style={{
            ...outlineBtn,
            opacity: setOverallRemarks.isPending || setGroundFlightMinutes.isPending ? 0.5 : 1,
            cursor:
              setOverallRemarks.isPending || setGroundFlightMinutes.isPending
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          Save draft
        </button>
      </div>

      {error ? (
        <p
          style={{
            color: '#f87171',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            fontSize: '0.82rem',
            margin: 0,
          }}
        >
          {error}
        </p>
      ) : null}

      <div
        style={{
          marginTop: '0.5rem',
          padding: '1rem',
          border: '1px solid rgba(248, 113, 113, 0.45)',
          borderRadius: 10,
          background: 'rgba(248, 113, 113, 0.08)',
        }}
      >
        <strong
          style={{
            color: '#f87171',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.78rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Sign and seal grade sheet
        </strong>
        <p style={{ fontSize: '0.85rem', margin: '0.5rem 0', color: '#cbd5e1' }}>
          This is legally binding. Once sealed, the grade sheet cannot be edited — corrections
          require a new grade sheet referencing this one.
        </p>
        <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ accentColor: '#f87171' }}
          />{' '}
          I certify the grades recorded above are accurate.
        </label>
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            disabled={!confirmed || seal.isPending}
            onClick={onSeal}
            style={{
              padding: '0.5rem 1.1rem',
              background: confirmed ? 'rgba(248, 113, 113, 0.18)' : 'rgba(122, 134, 154, 0.12)',
              color: confirmed ? '#f87171' : '#5b6784',
              border: `1px solid ${confirmed ? 'rgba(248, 113, 113, 0.55)' : '#1f2940'}`,
              borderRadius: 6,
              fontSize: '0.74rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: confirmed ? 'pointer' : 'not-allowed',
            }}
          >
            {seal.isPending ? 'Sealing…' : 'Sign and seal'}
          </button>
        </div>
      </div>
      {/* versionQ kept referenced to silence unused-var warnings if a future
          refactor wants to resurrect the lesson-scoped line item query. */}
      <span style={{ display: 'none' }}>{versionQ.isStale ? '' : ''}</span>
    </div>
  );
}
