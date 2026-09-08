'use client';

import { useState, type FormEvent } from 'react';
import { createMemberSchema, type CreateMemberInput, type RoleName } from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';

const ROLE_OPTIONS: RoleName[] = ['USER', 'MANAGER', 'ADMIN'];

interface AddMemberModalProps {
  onClose: () => void;
  onSubmit: (input: CreateMemberInput) => Promise<void>;
}

export function AddMemberModal({ onClose, onSubmit }: AddMemberModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<RoleName>('USER');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createMemberSchema.safeParse({ name, email, designation: designation || undefined, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add team member.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Add a team member</h2>
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

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Name" value={name} onChange={setName} autoFocus />
          <FormField label="Email" type="email" value={email} onChange={setEmail} />
          <FormField label="Designation (optional)" value={designation} onChange={setDesignation} required={false} />

          <label className="flex flex-col gap-1 text-sm text-text">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleName)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
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
              disabled={submitting}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
