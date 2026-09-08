'use client';

import { useEffect, useState } from 'react';
import { type ClientSummary, type CreateClientInput } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { AddClientModal } from './add-client-modal';
import { EditClientModal } from './edit-client-modal';

function asLink(website: string): { href: string; label: string } {
  const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return { href, label: website };
}

export default function ClientsPage() {
  const { status, role } = useRequireAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch<ClientSummary[]>('/clients')
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load clients'))
      .finally(() => setLoading(false));
  }, [status]);

  async function onAddClient(input: CreateClientInput) {
    const client = await apiFetch<ClientSummary>('/clients', { method: 'POST', body: JSON.stringify(input) });
    setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this client? Projects linked to it will keep their history but lose the client link.')) return;
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
      <main className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-text">Clients</h1>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Client
            </button>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-muted">No clients yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Website</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">POC</th>
                  <th className="px-4 py-2">Notes</th>
                  {canManage && <th className="px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-4 py-2.5 align-middle font-medium text-text">{c.name}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">
                      {c.website ? (
                        <a
                          href={asLink(c.website).href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          {c.website}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-middle text-muted">{c.location ?? '—'}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{c.poc ?? '—'}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{c.notes ?? '—'}</td>
                    {canManage && (
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button type="button" onClick={() => setEditingClient(c)} className="text-sm text-accent">
                            Edit
                          </button>
                          <button type="button" onClick={() => onDelete(c.id)} className="text-sm text-red-500">
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAddModal && <AddClientModal onClose={() => setShowAddModal(false)} onSubmit={onAddClient} />}

        {editingClient && (
          <EditClientModal
            client={editingClient}
            onClose={() => setEditingClient(null)}
            onSaved={(updated) => setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
          />
        )}
      </main>
    </div>
  );
}
