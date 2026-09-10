'use client';

import { useState } from 'react';

/** A quiet nod to the app's name — a heartbeat-monitor trace that endlessly scrolls along the
 * bottom edge of its container, at a fixed pace. Each blip's shape is randomized a little (peak
 * height, dip depth, P-wave bump) so consecutive beats aren't stamped-identical copies, like a
 * real monitor. The sequence of BEATS_PER_LOOP randomized blips is generated once per mount, then
 * duplicated back-to-back — animating by exactly one sequence-width keeps the loop seamless (the
 * visible window always has a full copy of the sequence to show, so it never runs dry), while
 * still showing BEATS_PER_LOOP different-looking beats flow past before anything repeats. */
const UNIT_WIDTH = 100;
const BEATS_PER_LOOP = 12;
const SEQUENCE_WIDTH = UNIT_WIDTH * BEATS_PER_LOOP;
// Preserves the original pace (100 viewBox units every 3.2s) now that a full loop covers many units.
const LOOP_SECONDS = (SEQUENCE_WIDTH / UNIT_WIDTH) * 3.2;

interface BeatShape {
  pBump: number; // P wave bump, y 8-13 (baseline 16 — smaller y = taller bump)
  rPeak: number; // R spike, y 1-5
  sDip: number; // S dip, y 24-32
}

function randomBeatShape(): BeatShape {
  return { pBump: 8 + Math.random() * 5, rPeak: 1 + Math.random() * 4, sDip: 24 + Math.random() * 8 };
}

function beatPath(o: number, { pBump, rPeak, sDip }: BeatShape): string {
  return `M${o},16 H${o + 12} L${o + 16},${pBump.toFixed(1)} L${o + 20},16 H${o + 34} L${o + 37},21 L${o + 40},${rPeak.toFixed(1)} L${o + 43},${sDip.toFixed(1)} L${o + 46},16 H${o + 62} L${o + 66},12 L${o + 70},16 H${o + UNIT_WIDTH}`;
}

/** Two identical copies of the same randomized beat sequence, back-to-back — so shifting by
 * exactly one sequence-width always has a full copy left to show (no gap), and the wrap from the
 * end of copy two back to the start of copy one is seamless since they're the same beats. */
function buildPulsePath(beats: BeatShape[]): string {
  return [...beats, ...beats].map((shape, i) => beatPath(i * UNIT_WIDTH, shape)).join(' ');
}

interface PulseLineProps {
  /** Tailwind height class for the strip, e.g. "h-8". Defaults to "h-8". */
  heightClassName?: string;
  /** Tailwind opacity class, e.g. "opacity-25". Defaults to "opacity-25". */
  opacityClassName?: string;
}

export function PulseLine({ heightClassName = 'h-8', opacityClassName = 'opacity-25' }: PulseLineProps) {
  // Generated once on mount, not re-rolled on every render — a stable random pattern for as long
  // as this component stays mounted; remounting (e.g. a page refresh) gets a new one.
  const [beats] = useState(() => Array.from({ length: BEATS_PER_LOOP }, randomBeatShape));
  const path = buildPulsePath(beats);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 ${heightClassName} ${opacityClassName}`}
      style={{ maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)' }}
    >
      <svg
        viewBox={`0 0 ${SEQUENCE_WIDTH * 2} 32`}
        preserveAspectRatio="none"
        className="h-full"
        style={{ width: SEQUENCE_WIDTH * 2, animation: `pulse-scan ${LOOP_SECONDS}s linear infinite` }}
      >
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
