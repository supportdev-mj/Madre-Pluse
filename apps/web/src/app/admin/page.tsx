'use client';

import { useEffect, useState } from 'react';
import { ORGANIZATION_PLANS, type AdminOrganizationSummary, type OrganizationPlanName } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminPage() {
  const { status, user } = useRequireAuth();
  const [orgs, setOrgs] = useState<AdminOrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = !!user?.isSuperAdmin;

  useEffect(() => {
    if (status !== 'authenticated' || !canView) return;
    apiFetch<AdminOrganizationSummary[]>('/admin/organizations')
      .then(setOrgs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load organizations'))
      .finally(() => setLoading(false));
  }, [status, canView]);

  async function onUpdate(id: string, patch: { plan?: OrganizationPlanName; status?: 'ACTIVE' | 'SUSPENDED' }) {
    setError(null);
    try {
      const updated = await apiFetch<AdminOrganizationSummary>(`/admin/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setOrgs((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization.');
    }
  }

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <h1 className="mb-1 text-xl font-bold text-text">Platform admin</h1>
        <p className="mb-6 text-sm text-muted">Every workspace on Madre Pulse — plan and access, not their task data.</p>

        {!canView ? (
          <p className="text-sm text-muted">Only superadmins can view this page.</p>
        ) : error ? (
          <p className="mb-4 text-sm text-red-500">{error}</p>
        ) : loading ? (
          <p className="text-muted">Loading…</p>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted">No organizations yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Organization</th>
                  <th className="px-4 py-2">Workspace ID</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Members</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-text">{o.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{o.slug}</td>
                    <td className="px-4 py-2 text-text">
                      <select
                        value={o.plan}
                        onChange={(e) => onUpdate(o.id, { plan: e.target.value as OrganizationPlanName })}
                        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                      >
                        {ORGANIZATION_PLANS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          o.status === 'ACTIVE'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                            : 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted">{o.memberCount}</td>
                    <td className="px-4 py-2 text-muted">{formatDate(o.createdAt)}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => onUpdate(o.id, { status: o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                        className="text-sm text-accent"
                      >
                        {o.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
