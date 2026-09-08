'use client';

import { useEffect, useState } from 'react';
import { type ClientSummary, type CreateProjectInput, type ProjectSummary } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { AddProjectModal } from './add-project-modal';
import { EditProjectModal } from './edit-project-modal';

export default function ProjectsPage() {
  const { status, role } = useRequireAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

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

  async function onAddProject(input: CreateProjectInput) {
    const project = await apiFetch<ProjectSummary>('/projects', { method: 'POST', body: JSON.stringify(input) });
    setProjects((prev) => [project, ...prev]);
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
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-text">Projects</h1>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Project
            </button>
          )}
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted">No projects yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Status</th>
                  {canManage && <th className="px-4 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2.5 align-middle font-medium text-text">{p.name}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{p.description ?? '—'}</td>
                    <td className="px-4 py-2.5 align-middle text-muted">{p.clientName ?? '—'}</td>
                    <td className="px-4 py-2.5 align-middle">
                      <span
                        className={
                          p.status === 'ACTIVE'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                            : 'rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-muted'
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <button type="button" onClick={() => setEditingProject(p)} className="text-sm text-accent">
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleArchive(p)}
                            className={p.status === 'ACTIVE' ? 'text-sm text-red-500' : 'text-sm text-accent'}
                          >
                            {p.status === 'ACTIVE' ? 'Archive' : 'Reactivate'}
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

        {showAddModal && (
          <AddProjectModal clients={clients} onClose={() => setShowAddModal(false)} onSubmit={onAddProject} />
        )}

        {editingProject && (
          <EditProjectModal
            project={editingProject}
            clients={clients}
            onClose={() => setEditingProject(null)}
            onSaved={(updated) => setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
          />
        )}
      </main>
    </div>
  );
}
