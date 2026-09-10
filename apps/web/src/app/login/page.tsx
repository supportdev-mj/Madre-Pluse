'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginSchema } from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';
import { PulseLine } from '../../components/pulse-line';
import { useAuth } from '../../lib/auth-context';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(14,165,233,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,.08) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden p-8" style={GRID_BG}>
      <PulseLine heightClassName="h-20" opacityClassName="opacity-[0.18]" />

      <div className="relative flex flex-col items-center gap-3">
        <div className="inline-block rounded-md dark:bg-white dark:p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Madre Pulse" className="h-12 w-auto rounded-md" />
        </div>
      </div>

      <div className="relative w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-text">Sign in</h1>
        <p className="mb-6 text-sm text-muted">Welcome back to Madre Pulse.</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          <FormField label="Password" type="password" value={password} onChange={setPassword} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Need a workspace?{' '}
          <Link href="/register" className="text-accent">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
