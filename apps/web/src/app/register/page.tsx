'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { registerSchema } from '@madre-pulse/shared';
import { AuthPageShell } from '../../components/auth-page-shell';
import { FormField } from '../../components/form-field';
import { LogoLoader } from '../../components/logo-loader';
import { useAuth } from '../../lib/auth-context';

// How long the branded transition plays before actually navigating away — long enough to read as
// a deliberate animation, short enough not to feel like a delay.
const TRANSITION_MS = 550;

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ orgName, name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      // Fade into the same branded loader the destination page opens with, then navigate — so the
      // hand-off from this form to the app reads as one continuous animation, not a hard cut.
      setJustRegistered(true);
      setTimeout(() => router.push('/'), TRANSITION_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
      setSubmitting(false);
    }
  }

  if (justRegistered) {
    return <LogoLoader label="Setting up your workspace…" fadeIn />;
  }

  return (
    <AuthPageShell>
      <div className="relative w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-text">Create your workspace</h1>
        <p className="mb-6 text-sm text-muted">Set up your organization and admin account.</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Organization name" value={orgName} onChange={setOrgName} autoFocus />
          <FormField label="Your name" value={name} onChange={setName} />
          <FormField label="Email" type="email" value={email} onChange={setEmail} />
          <FormField label="Password" type="password" value={password} onChange={setPassword} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create workspace'}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}
