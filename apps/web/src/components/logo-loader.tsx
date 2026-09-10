'use client';

import { PulseLine } from './pulse-line';

/** The branded transition shown right after signing in, while the app figures out where to send
 * you — replaces a bare "Loading…" text with a gently breathing logo over the same heartbeat
 * trace used on the dashboard, so the hand-off from login feels like part of one continuous,
 * on-brand moment rather than a jarring blank flash. */
export function LogoLoader({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden p-8">
      <PulseLine heightClassName="h-16" opacityClassName="opacity-[0.15]" />
      <div
        className="relative inline-block rounded-md dark:bg-white dark:p-1.5"
        style={{ animation: 'logo-breathe 1.8s ease-in-out infinite' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Madre Pulse" className="h-12 w-auto rounded-md" />
      </div>
      <p className="relative text-sm text-muted">{label}</p>
    </main>
  );
}
