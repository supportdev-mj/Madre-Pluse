'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  TASK_PRIORITIES,
  updateMomCandidateSchema,
  type MemberSummary,
  type MomTaskCandidateSummary,
  type RoleName,
  type TaskPriorityName,
} from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { computeAssignableMembers } from '../../lib/assignable-members';

interface EditCandidateModalProps {
  candidate: MomTaskCandidateSummary;
  members: MemberSummary[];
  role: RoleName | null;
  currentUserId: string | undefined;
  onClose: () => void;
  onSaved: (updated: MomTaskCandidateSummary) => void;
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function EditCandidateModal({ candidate, members, role, currentUserId, onClose, onSaved }: EditCandidateModalProps) {
  const [title, setTitle] = useState(candidate.title);
  const [description, setDescription] = useState(candidate.description);
  const [dueDate, setDueDate] = useState(toDateInputValue(candidate.dueDate));
  const [assigneeIds, setAssigneeIds] = useState<string[]>(candidate.suggestedAssigneeIds);
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [priority, setPriority] = useState<TaskPriorityName>(candidate.priority);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const assigneeMenuRef = useRef<HTMLDivElement>(null);

  // Same scoping as task creation: a superior picks from themself + direct reports (or anyone,
  // for an admin) — always keeping the AI's suggested assignee(s) visible even outside that range.
  const assignableMembers = computeAssignableMembers(members, role, currentUserId, candidate.suggestedAssigneeIds);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (assigneeMenuRef.current && !assigneeMenuRef.current.contains(e.target as Node)) {
        setAssigneeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  const assigneeSummary =
    assigneeIds.length === 0
      ? 'Select assignee(s)'
      : assigneeIds
          .map((id) => assignableMembers.find((m) => m.userId === id)?.name)
          .filter(Boolean)
          .join(', ') || `${assigneeIds.length} selected`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updateMomCandidateSchema.safeParse({
      title,
      description,
      dueDate: dueDate || null,
      assigneeIds,
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

          <div ref={assigneeMenuRef} className="relative flex flex-col gap-1 text-sm text-text">
            Assignee
            <button
              type="button"
              onClick={() => setAssigneeMenuOpen((v) => !v)}
              className="flex items-center justify-between rounded-card border border-border bg-surface-alt px-3 py-2 text-left text-sm text-text"
            >
              <span className={assigneeIds.length === 0 ? 'text-muted' : ''}>{assigneeSummary}</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 shrink-0 text-muted">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {assigneeMenuOpen && (
              <div className="absolute top-full z-10 mt-1 flex max-h-48 w-full flex-col gap-1.5 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-md">
                {assignableMembers.length === 0 ? (
                  <span className="px-1 py-1 text-xs text-muted">No one available to assign.</span>
                ) : (
                  assignableMembers.map((m) => (
                    <label key={m.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-text hover:bg-surface-alt">
                      <input type="checkbox" checked={assigneeIds.includes(m.userId)} onChange={() => toggleAssignee(m.userId)} />
                      {m.name}
                      {m.userId === currentUserId && <span className="text-xs text-muted">(you)</span>}
                    </label>
                  ))
                )}
              </div>
            )}
            {candidate.suggestedAssigneeName && candidate.suggestedAssigneeIds.length === 0 && (
              <span className="text-xs text-amber-600">
                MoM mentioned &quot;{candidate.suggestedAssigneeName}&quot; but no matching team member was found — please pick one.
              </span>
            )}
          </div>

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
