'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createProjectSchema, type ClientSummary, type ProjectSummary } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

export default function ProjectsPage() {
  const { status, role } = useRequireAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([apiFetch<ProjectSummary[]>('/projects'), apiFetch<ClientSummary[]>('/clients')])
      .then(([p, c]) => {
        setProjects(p);
        setClients(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load projects'))
      .finally(() => setLoading(false));
  }, [status]);

  async function onAddProject(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createProjectSchema.safeParse({
      name,
      description: description || undefined,
      clientId: clientId || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      const project = await apiFetch<ProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(parsed.data) });
      setProjects((prev) => [project, ...prev]);
      setName('');
      setDescription('');
      setClientId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add project.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggleArchive(project: ProjectSummary) {
    setError(null);
    try {
      const nextStatus = project.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
      const updated = await apiFetch<ProjectSummary>(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project.');
    }
  }

  if (status !== 'authenticated') return null;

  const canManage = role === 'ADMIN' || role === 'MANAGER';

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-xl font-bold text-text">Projects</h1>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="mb-8 text-sm text-muted">No projects yet.</p>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Status</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 text-text">{p.name}</td>
                    <td className="px-4 py-2 text-muted">{p.clientName ?? '—'}</td>
                    <td className="px-4 py-2 text-text">{p.status}</td>
                    {canManage && (
                      <td className="px-4 py-2">
                        <button type="button" onClick={() => onToggleArchive(p)} className="text-sm text-accent">
                          {p.status === 'ACTIVE' ? 'Archive' : 'Reactivate'}
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
            <h2 className="mb-4 text-base font-semibold text-text">Add a project</h2>
            <form onSubmit={onAddProject} className="flex flex-col gap-4">
              <FormField label="Name" value={name} onChange={setName} />
              <FormField label="Description (optional)" value={description} onChange={setDescription} required={false} />
              <label className="flex flex-col gap-1 text-sm text-text">
                Client (optional)
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add project'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
