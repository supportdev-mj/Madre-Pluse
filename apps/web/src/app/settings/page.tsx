'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { updateOrganizationSchema, type GoogleIntegrationStatus, type OrganizationSummary } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useTheme } from '../../lib/theme-context';
import { useRequireAuth } from '../../lib/use-require-auth';

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

  const [google, setGoogle] = useState<GoogleIntegrationStatus | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canView = role === 'ADMIN';

  function loadGoogleStatus() {
    return apiFetch<GoogleIntegrationStatus>('/integrations/google/status')
      .then(setGoogle)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load Google integration status'))
      .finally(() => setGoogleLoading(false));
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
    loadGoogleStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      setGoogleNotice('Google Workspace connected.');
    } else if (params.get('google') === 'error') {
      setGoogleNotice('Failed to connect Google Workspace — please try again.');
    }
    if (params.has('google')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canView]);

  async function onConnectGoogle() {
    setError(null);
    setConnecting(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/integrations/google/connect-url');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google connection.');
      setConnecting(false);
    }
  }

  async function onDisconnectGoogle() {
    if (!window.confirm('Disconnect Google Workspace? Meeting transcript syncing will stop.')) return;
    setError(null);
    setDisconnecting(true);
    try {
      await apiFetch('/integrations/google', { method: 'DELETE' });
      await loadGoogleStatus();
      setGoogleNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google Workspace.');
    } finally {
      setDisconnecting(false);
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
              <h2 className="mb-1 text-base font-semibold text-text">Meeting integrations</h2>
              <p className="mb-4 text-sm text-muted">
                Connect Google Workspace so Madre Pulse can pull Google Meet transcripts and turn them into meeting
                minutes and draft tasks.
              </p>
              {googleNotice && (
                <p className="mb-4 rounded-card border border-accent bg-surface-alt p-3 text-sm text-text">{googleNotice}</p>
              )}
              {googleLoading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : google?.connected ? (
                <div className="flex items-center justify-between rounded-card border border-border bg-surface-alt p-3">
                  <div>
                    <p className="text-sm font-medium text-text">Connected</p>
                    <p className="text-xs text-muted">{google.googleEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onDisconnectGoogle}
                    disabled={disconnecting}
                    className="text-sm text-red-500 disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onConnectGoogle}
                  disabled={connecting}
                  className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {connecting ? 'Redirecting…' : 'Connect Google Workspace'}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
