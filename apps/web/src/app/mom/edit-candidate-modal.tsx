'use client';

import { useState, type FormEvent } from 'react';
import {
  TASK_PRIORITIES,
  updateMomCandidateSchema,
  type MemberSummary,
  type MomTaskCandidateSummary,
  type TaskPriorityName,
} from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';

interface EditCandidateModalProps {
  candidate: MomTaskCandidateSummary;
  members: MemberSummary[];
  onClose: () => void;
  onSaved: (updated: MomTaskCandidateSummary) => void;
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function EditCandidateModal({ candidate, members, onClose, onSaved }: EditCandidateModalProps) {
  const [title, setTitle] = useState(candidate.title);
  const [description, setDescription] = useState(candidate.description);
  const [dueDate, setDueDate] = useState(toDateInputValue(candidate.dueDate));
  const [assigneeId, setAssigneeId] = useState(candidate.suggestedAssigneeId ?? '');
  const [priority, setPriority] = useState<TaskPriorityName>(candidate.priority);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updateMomCandidateSchema.safeParse({
      title,
      description,
      dueDate: dueDate || null,
      assigneeId: assigneeId || null,
      priority,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<MomTaskCandidateSummary>(`/mom/candidates/${candidate.id}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-lg rounded-card border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Edit queued item</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-card p-1 text-muted hover:bg-surface-alt hover:text-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {candidate.context && (
          <p className="mb-4 rounded-card border border-border bg-surface-alt p-3 text-xs text-muted">
            AI context: {candidate.context}
          </p>
        )}

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" value={title} onChange={setTitle} autoFocus />

          <label className="flex flex-col gap-1 text-sm text-text">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          <FormField label="Due date" type="date" value={dueDate} onChange={setDueDate} />

          <label className="flex flex-col gap-1 text-sm text-text">
            Assignee
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              <option value="" disabled>
                Select a team member
              </option>
              {activeMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            {candidate.suggestedAssigneeName && !candidate.suggestedAssigneeId && (
              <span className="text-xs text-amber-600">
                MoM mentioned &quot;{candidate.suggestedAssigneeName}&quot; but no matching team member was found — please pick one.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriorityName)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-card border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-alt"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
