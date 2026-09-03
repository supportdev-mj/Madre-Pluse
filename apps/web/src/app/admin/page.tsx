'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ORGANIZATION_PLANS,
  updateLlmSettingsSchema,
  type AdminOrganizationSummary,
  type LlmSettingsStatus,
  type OrganizationPlanName,
} from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
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

  const [llm, setLlm] = useState<LlmSettingsStatus | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmSaved, setLlmSaved] = useState(false);

  const canView = !!user?.isSuperAdmin;

  useEffect(() => {
    if (status !== 'authenticated' || !canView) return;
    apiFetch<AdminOrganizationSummary[]>('/admin/organizations')
      .then(setOrgs)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load organizations'))
      .finally(() => setLoading(false));
    apiFetch<LlmSettingsStatus>('/admin/llm-settings')
      .then((s) => {
        setLlm(s);
        if (s.model) setModel(s.model);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load AI provider settings'))
      .finally(() => setLlmLoading(false));
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

  async function onSaveLlm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLlmSaved(false);

    const parsed = updateLlmSettingsSchema.safeParse({ apiKey, model: model || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSavingLlm(true);
    try {
      const updated = await apiFetch<LlmSettingsStatus>('/admin/llm-settings', {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      });
      setLlm(updated);
      setApiKey('');
      setLlmSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save AI provider settings.');
    } finally {
      setSavingLlm(false);
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
        ) : (
          <div className="flex flex-col gap-6">
            {error && <p className="text-sm text-red-500">{error}</p>}

            {loading ? (
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

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">AI provider (meeting notes)</h2>
              <p className="mb-4 text-sm text-muted">
                One platform-wide API key, used to turn meeting transcripts into minutes and draft tasks for every
                workspace — this is a shared cost the platform bears, not something each org configures for itself.
              </p>
              {llmLoading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-text">
                    Status:{' '}
                    {llm?.configured ? (
                      <span className="font-medium text-green-600">
                        Configured{llm.model ? ` (model: ${llm.model})` : ''}
                        {llm.updatedAt ? ` — last updated ${formatDate(llm.updatedAt)}` : ''}
                      </span>
                    ) : (
                      <span className="font-medium text-red-500">Not configured</span>
                    )}
                  </p>
                  <form onSubmit={onSaveLlm} className="flex flex-col gap-4 sm:max-w-sm">
                    <FormField
                      label={llm?.configured ? 'Replace API key' : 'API key'}
                      type="password"
                      value={apiKey}
                      onChange={setApiKey}
                    />
                    <FormField label="Model (optional)" value={model} onChange={setModel} required={false} />
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={savingLlm}
                        className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {savingLlm ? 'Saving…' : 'Save'}
                      </button>
                      {llmSaved && <span className="text-sm text-green-600">Saved.</span>}
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
