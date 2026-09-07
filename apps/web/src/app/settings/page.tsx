'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  updateMomAiSettingsSchema,
  updateOrganizationSchema,
  type MomAiSettingsStatus,
  type OrganizationSummary,
} from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useTheme } from '../../lib/theme-context';
import { useRequireAuth } from '../../lib/use-require-auth';
import { ChangePasswordForm } from './change-password-form';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SettingsPage() {
  const { status, role } = useRequireAuth();
  const { setOrgName } = useAuth();
  const { theme, setTheme } = useTheme();
  const [org, setOrg] = useState<OrganizationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [momAi, setMomAi] = useState<MomAiSettingsStatus | null>(null);
  const [momAiLoading, setMomAiLoading] = useState(true);
  const [momApiKey, setMomApiKey] = useState('');
  const [momModel, setMomModel] = useState('');
  const [savingMomAi, setSavingMomAi] = useState(false);
  const [momAiSaved, setMomAiSaved] = useState(false);

  const canView = role === 'ADMIN';

  function loadMomAiStatus() {
    return apiFetch<MomAiSettingsStatus>('/mom/settings')
      .then(setMomAi)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load AI provider status'))
      .finally(() => setMomAiLoading(false));
  }

  useEffect(() => {
    if (status !== 'authenticated' || !canView) return;
    apiFetch<OrganizationSummary>('/organization')
      .then((o) => {
        setOrg(o);
        setName(o.name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load organization'))
      .finally(() => setLoading(false));
    loadMomAiStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canView]);

  async function onSaveMomAi(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMomAiSaved(false);

    const parsed = updateMomAiSettingsSchema.safeParse({ apiKey: momApiKey, model: momModel || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSavingMomAi(true);
    try {
      const updated = await apiFetch<MomAiSettingsStatus>('/mom/settings', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setMomAi(updated);
      setMomApiKey('');
      setMomModel('');
      setMomAiSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save AI provider settings.');
    } finally {
      setSavingMomAi(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const parsed = updateOrganizationSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<OrganizationSummary>('/organization', {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      setOrg(updated);
      setOrgName(updated.name);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <h1 className="mb-6 text-xl font-bold text-text">Settings</h1>

        <div className="mb-6 rounded-card border border-border bg-surface p-6">
          <h2 className="mb-1 text-base font-semibold text-text">Appearance</h2>
          <p className="mb-4 text-sm text-muted">Choose how Madre Pulse looks on this device.</p>
          <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-card border border-border bg-surface-alt p-1">
            {(['light', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={theme === option}
                onClick={() => setTheme(option)}
                className={
                  theme === option
                    ? 'rounded-card bg-accent px-4 py-1.5 text-sm font-medium capitalize text-white'
                    : 'rounded-card px-4 py-1.5 text-sm font-medium capitalize text-muted hover:text-text'
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <ChangePasswordForm />
        </div>

        <h2 className="mb-4 text-base font-semibold text-text">Organization</h2>

        {!canView ? (
          <p className="text-sm text-muted">Only admins can view organization settings.</p>
        ) : error ? (
          <p className="mb-4 text-sm text-red-500">{error}</p>
        ) : loading || !org ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-card border border-border bg-surface p-6">
              <form onSubmit={onSave} className="flex flex-col gap-4">
                <FormField label="Organization name" value={name} onChange={setName} />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving || name === org.name}
                    className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {saved && <span className="text-sm text-green-600">Saved.</span>}
                </div>
              </form>
            </div>

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Workspace details</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Workspace ID (slug)</dt>
                  <dd className="font-mono text-text">{org.slug}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Plan</dt>
                  <dd className="text-text">{org.plan}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Active members</dt>
                  <dd className="text-text">{org.memberCount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Created</dt>
                  <dd className="text-text">{formatDate(org.createdAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">AI provider (MOM extraction)</h2>
              <p className="mb-4 text-sm text-muted">
                Add your organization&apos;s Anthropic API key so the MOM page can read uploaded meeting-minutes
                PDFs and extract action items into a review queue.
              </p>
              {momAiLoading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-text">
                    Status:{' '}
                    {momAi?.configured ? (
                      <span className="font-medium text-green-600">
                        Configured{momAi.model ? ` (model: ${momAi.model})` : ''}
                        {momAi.updatedAt ? ` — last updated ${formatDate(momAi.updatedAt)}` : ''}
                      </span>
                    ) : (
                      <span className="font-medium text-red-500">Not configured</span>
                    )}
                  </p>
                  <form onSubmit={onSaveMomAi} className="flex flex-col gap-4 sm:max-w-sm">
                    <FormField
                      label={momAi?.configured ? 'Replace API key' : 'API key'}
                      type="password"
                      value={momApiKey}
                      onChange={setMomApiKey}
                    />
                    <FormField label="Model (optional)" value={momModel} onChange={setMomModel} required={false} />
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={savingMomAi}
                        className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {savingMomAi ? 'Saving…' : 'Save'}
                      </button>
                      {momAiSaved && <span className="text-sm text-green-600">Saved.</span>}
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
