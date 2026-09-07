'use client';

import { useState, type FormEvent } from 'react';
import { changePasswordSchema } from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <h2 className="mb-1 text-base font-semibold text-text">Password</h2>
      <p className="mb-4 text-sm text-muted">Change your account password. You&apos;ll stay signed in here, but any other signed-in device will need to sign in again.</p>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:max-w-sm">
        <FormField label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
        <FormField label="New password" type="password" value={newPassword} onChange={setNewPassword} />
        <FormField label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Change password'}
          </button>
          {saved && <span className="text-sm text-green-600">Password changed.</span>}
        </div>
      </form>
    </div>
  );
}
