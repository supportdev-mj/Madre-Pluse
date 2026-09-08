'use client';

import { useState, type FormEvent } from 'react';
import { updateClientSchema, type ClientSummary } from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';

interface EditClientModalProps {
  client: ClientSummary;
  onClose: () => void;
  onSaved: (updated: ClientSummary) => void;
}

export function EditClientModal({ client, onClose, onSaved }: EditClientModalProps) {
  const [name, setName] = useState(client.name);
  const [website, setWebsite] = useState(client.website ?? '');
  const [location, setLocation] = useState(client.location ?? '');
  const [poc, setPoc] = useState(client.poc ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = updateClientSchema.safeParse({
      name,
      website: website || null,
      location: location || null,
      poc: poc || null,
      notes: notes || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<ClientSummary>(`/clients/${client.id}`, {
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
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Edit client</h2>
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
          <FormField label="Website (optional)" value={website} onChange={setWebsite} required={false} />
          <FormField label="Location (optional)" value={location} onChange={setLocation} required={false} />
          <FormField label="POC (optional)" value={poc} onChange={setPoc} required={false} />

          <label className="flex flex-col gap-1 text-sm text-text">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
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
