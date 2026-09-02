'use client';

import { AppNav } from '../components/app-nav';
import { useRequireAuth } from '../lib/use-require-auth';

export default function Home() {
  const { status, user, org, role } = useRequireAuth();

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted">Loading…</p>
      </main>
    );
  }

  if (status === 'unauthenticated' || !user || !org) {
    return null;
  }

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="flex flex-col items-center justify-center gap-6 px-8 pb-8 pt-20 sm:pt-8">
        <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.initials}
          </div>
          <h1 className="text-xl font-bold text-text">Welcome, {user.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {org.name} · <span className="uppercase">{role}</span>
          </p>
          <p className="mt-4 text-sm text-muted">
            Use the nav above to manage your team, clients, and projects. Task management features land slice by slice.
          </p>
        </div>
      </main>
    </div>
  );
}
