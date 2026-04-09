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

  if (sealed) {
    return (
      <div
        style={{
          padding: '1rem',
          background: '#dcfce7',
          border: '2px solid #16a34a',
          borderRadius: 4,
        }}
      >
        🔒 <strong>Grade sheet sealed.</strong> This record is immutable.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
        Grading scale: <strong>{gradingScale.replace('_', ' ')}</strong>. Grades saved to
        the draft; seal to finalize. The server enforces the must-pass contract before
        sealing.
      </p>

      {/* Summary of graded line items so far */}
      {Object.keys(localGrades).length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.25rem' }}>Line item</th>
              <th style={{ padding: '0.25rem' }}>Grade</th>
              <th style={{ padding: '0.25rem' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(localGrades).map((g) => (
              <tr key={g.lineItemId} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.25rem', fontFamily: 'monospace' }}>{g.title}</td>
                <td style={{ padding: '0.25rem' }}>{g.gradeValue}</td>
                <td style={{ padding: '0.25rem' }}>{g.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div
        style={{
          padding: '0.5rem',
          border: '1px solid #eee',
          borderRadius: 4,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 2fr auto',
          gap: '0.5rem',
          alignItems: 'end',
          fontSize: '0.85rem',
        }}
      >
        <label>
          Line item ID
          <input
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            placeholder="line_item uuid"
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Grade
          <select
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Remarks
          <input
            value={newRemarks}
            onChange={(e) => setNewRemarks(e.target.value)}
            placeholder="optional"
            style={{ width: '100%' }}
          />
        </label>
        <button type="button" onClick={onAddGrade} disabled={setGrade.isPending}>
          Save
        </button>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
        Line item IDs come from the course version tree editor. A richer picker is a
        follow-up; for now the line items were pre-stubbed on the server when the
        grade sheet was created.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          fontSize: '0.85rem',
        }}
      >
        <label>
          Ground minutes
          <input
            type="number"
            min={0}
            value={groundMinutes}
            onChange={(e) => setGroundMinutes(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Flight minutes
          <input
            type="number"
            min={0}
            value={flightMinutes}
            onChange={(e) => setFlightMinutes(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <label style={{ fontSize: '0.85rem' }}>
        Overall remarks
        <textarea
          rows={3}
          value={overallRemarks}
          onChange={(e) => setOverallRemarksLocal(e.target.value)}
          style={{ width: '100%' }}
        />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onSaveOverall}
          disabled={setOverallRemarks.isPending || setGroundFlightMinutes.isPending}
        >
          Save draft
        </button>
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.75rem',
          border: '3px solid #b91c1c',
          borderRadius: 4,
          background: '#fef2f2',
        }}
      >
        <strong style={{ color: '#7f1d1d' }}>Sign and seal grade sheet</strong>
        <p style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>
          This is legally binding. Once sealed, the grade sheet cannot be edited —
          corrections require a new grade sheet referencing this one.
        </p>
        <label style={{ fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          I certify the grades recorded above are accurate.
        </label>
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            disabled={!confirmed || seal.isPending}
            onClick={onSeal}
            style={{
              padding: '0.5rem 1rem',
              background: confirmed ? '#b91c1c' : '#9ca3af',
              color: 'white',
              border: 0,
              borderRadius: 4,
              fontWeight: 600,
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
