'use client';

import { useEffect, useState } from 'react';
import type { ProductivityReport } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch, getAccessToken } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function buildQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function ReportsPage() {
  const { status, role } = useRequireAuth();
  const canView = role === 'ADMIN' || role === 'MANAGER';

  const [report, setReport] = useState<ProductivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProductivityReport>(`/reports/productivity${buildQuery(from, to)}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status !== 'authenticated' || !canView) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canView]);

  async function onDownloadCsv() {
    setError(null);
    setDownloading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_URL}/reports/productivity.csv${buildQuery(from, to)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to download CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'productivity-report.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download CSV');
    } finally {
      setDownloading(false);
    }
  }

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen sm:pl-60 print:pl-0">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8 print:pt-8">
        <h1 className="mb-6 text-xl font-bold text-text">Reports</h1>

        {!canView ? (
          <p className="text-sm text-muted">Only admins and managers can view reports.</p>
        ) : (
          <>
            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

            <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
              <label className="flex flex-col gap-1 text-sm text-text">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <button
                type="button"
                onClick={load}
                className="rounded-card border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-alt"
              >
                Apply
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={onDownloadCsv}
                disabled={downloading}
                className="rounded-card border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-alt disabled:opacity-50"
              >
                {downloading ? 'Downloading…' : 'Download CSV'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                Print / Save as PDF
              </button>
            </div>

            <h2 className="mb-2 hidden text-lg font-semibold text-black print:block">
              Productivity report{from || to ? ` (${from || '…'} to ${to || '…'})` : ''}
            </h2>

            {loading || !report ? (
              <p className="text-muted">Loading…</p>
            ) : report.rows.length === 0 ? (
              <p className="text-sm text-muted">No active members.</p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-border print:rounded-none print:border-black">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-alt text-muted print:bg-white print:text-black">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Completed</th>
                      <th className="px-4 py-2">On-time rate</th>
                      <th className="px-4 py-2">Total time</th>
                      <th className="px-4 py-2">Avg time / task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.userId} className="border-t border-border print:border-black">
                        <td className="px-4 py-2 text-text print:text-black">{r.name}</td>
                        <td className="px-4 py-2 text-text print:text-black">{r.completedCount}</td>
                        <td className="px-4 py-2 text-text print:text-black">
                          {r.onTimeRate !== null ? `${r.onTimeRate}%` : '—'}
                        </td>
                        <td className="px-4 py-2 text-text print:text-black">{formatMinutes(r.totalMinutes)}</td>
                        <td className="px-4 py-2 text-text print:text-black">
                          {r.avgMinutesPerTask !== null ? formatMinutes(r.avgMinutesPerTask) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
