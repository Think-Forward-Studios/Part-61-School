'use client';

/**
 * WorkOrderTasks — tasks list + per-task Complete button.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface Task {
  id: string;
  description: string;
  requiredAuthority: string;
  completedAt: string | null;
  position: number;
}

export function WorkOrderTasks({
  workOrderId,
  tasks,
}: {
  workOrderId: string;
  tasks: Task[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const completeTask = trpc.admin.workOrders.completeTask.useMutation();
  const addTask = trpc.admin.workOrders.addTask.useMutation();
  const [newDesc, setNewDesc] = useState('');

  async function onComplete(taskId: string) {
    setError(null);
    try {
      await completeTask.mutateAsync({ taskId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Complete failed');
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newDesc.trim()) return;
    setError(null);
    try {
      await addTask.mutateAsync({
        workOrderId,
        description: newDesc.trim(),
        position: tasks.length,
      });
      setNewDesc('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add task failed');
    }
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '0.75rem',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Tasks</h2>
      {tasks.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No tasks yet.</p>
      ) : (
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {tasks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((t) => (
              <li key={t.id} style={{ padding: '0.35rem 0' }}>
                <span
                  style={{
                    textDecoration: t.completedAt ? 'line-through' : 'none',
                    color: t.completedAt ? '#6b7280' : '#1f2937',
                  }}
                >
                  {t.description}
                </span>
                <span
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.7rem',
                    padding: '0.1rem 0.4rem',
                    background: t.requiredAuthority === 'ia' ? '#7c3aed' : '#0369a1',
                    color: 'white',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                  }}
                >
                  {t.requiredAuthority === 'ia' ? 'IA' : 'A&P'}
                </span>
                {!t.completedAt ? (
                  <button
                    type="button"
                    onClick={() => onComplete(t.id)}
                    disabled={completeTask.isPending}
                    style={{
                      marginLeft: '0.5rem',
                      padding: '0.2rem 0.5rem',
                      background: '#16a34a',
                      color: 'white',
                      border: 0,
                      borderRadius: 3,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Mark complete
                  </button>
                ) : (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#16a34a' }}>
                    ✓ {new Date(t.completedAt).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
        </ol>
      )}
      <form
        onSubmit={onAdd}
        style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}
      >
        <input
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="New task description"
          style={{ flex: 1, padding: '0.3rem' }}
        />
        <button
          type="submit"
          disabled={addTask.isPending}
          style={{
            padding: '0.3rem 0.8rem',
            background: '#0070f3',
            color: 'white',
            border: 0,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Add task
        </button>
      </form>
      {error ? (
        <p style={{ color: 'crimson', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
