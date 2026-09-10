'use client';

import { useEffect, useState } from 'react';
import { PulseLine } from './pulse-line';

interface LogoLoaderProps {
  label?: string;
  /** When true, starts at opacity-0 and fades in on mount — used right after a successful
   * sign-in/registration, before the actual route change, so the hand-off from the form to the
   * next page reads as one smooth animation instead of a hard cut. The destination page's own
   * LogoLoader (fadeIn left off) then just continues the same look with no further transition. */
  fadeIn?: boolean;
}

/** The branded transition shown right after signing in, while the app figures out where to send
 * you — replaces a bare "Loading…" text with a gently breathing logo over the same heartbeat
 * trace used on the dashboard, so the hand-off from login feels like part of one continuous,
 * on-brand moment rather than a jarring blank flash. */
export function LogoLoader({ label = 'Loading your workspace…', fadeIn = false }: LogoLoaderProps) {
  const [visible, setVisible] = useState(!fadeIn);

  useEffect(() => {
    if (!fadeIn) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [fadeIn]);

  return (
    <main
      className={`relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden p-8 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
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
