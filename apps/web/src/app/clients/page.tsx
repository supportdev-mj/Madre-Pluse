'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClientSchema, type ClientSummary } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

export default function ClientsPage() {
  const { status, role } = useRequireAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch<ClientSummary[]>('/clients')
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients'))
      .finally(() => setLoading(false));
  }, [status]);

  async function onAddClient(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createClientSchema.safeParse({ name, notes: notes || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      const client = await apiFetch<ClientSummary>('/clients', { method: 'POST', body: JSON.stringify(parsed.data) });
      setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/clients/${id}`, { method: 'DELETE' });
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete client.');
    }
  }

  if (status !== 'authenticated') return null;

  const canManage = role === 'ADMIN' || role === 'MANAGER';

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <h1 className="mb-6 text-xl font-bold text-text">Clients</h1>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="mb-8 text-sm text-muted">No clients yet.</p>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Notes</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2 text-text">{c.name}</td>
                    <td className="px-4 py-2 text-muted">{c.notes ?? '—'}</td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <button type="button" onClick={() => onDelete(c.id)} className="text-sm text-red-500">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage && (
          <div className="max-w-sm rounded-card border border-border bg-surface p-6">
            <h2 className="mb-4 text-base font-semibold text-text">Add a client</h2>
            <form onSubmit={onAddClient} className="flex flex-col gap-4">
              <FormField label="Name" value={name} onChange={setName} />
              <FormField label="Notes (optional)" value={notes} onChange={setNotes} required={false} />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add client'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
