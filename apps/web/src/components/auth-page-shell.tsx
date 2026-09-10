'use client';

import type { ReactNode } from 'react';
import { PulseLine } from './pulse-line';

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(14,165,233,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,.08) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

/** Shared chrome for the login and register pages — the logo, the same subtle grid backdrop and
 * heartbeat trace used on the dashboard hero, and a slot for the actual form card. Keeps both
 * pages visually consistent with each other and with the rest of the app. */
export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden p-8" style={GRID_BG}>
      <PulseLine heightClassName="h-20" opacityClassName="opacity-[0.18]" />

      <div className="relative inline-block rounded-md dark:bg-white dark:p-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Madre Pulse" className="h-12 w-auto rounded-md" />
      </div>

      {children}
    </main>
  );
}
