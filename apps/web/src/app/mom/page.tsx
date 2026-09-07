'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MOM_CANDIDATE_STATUSES,
  type MemberSummary,
  type MomCandidateStatusName,
  type MomTaskCandidateSummary,
  type MomUploadResult,
} from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { EditCandidateModal } from './edit-candidate-modal';

const STATUS_LABELS: Record<MomCandidateStatusName, string> = {
  PENDING: 'Pending review',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MomPage() {
  const { status, role } = useRequireAuth();
  const canAccess = role === 'ADMIN' || role === 'MANAGER';

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [candidates, setCandidates] = useState<MomTaskCandidateSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<MomCandidateStatusName>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<MomTaskCandidateSummary | null>(null);

  async function loadCandidates(nextStatus: MomCandidateStatusName) {
    const data = await apiFetch<MomTaskCandidateSummary[]>(`/mom/candidates?status=${nextStatus}`);
    setCandidates(data);
  }

  useEffect(() => {
    if (status !== 'authenticated' || !canAccess) return;
    setLoading(true);
    Promise.all([apiFetch<MemberSummary[]>('/members'), loadCandidates(statusFilter)])
      .then(([m]) => setMembers(m))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load MOM queue'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canAccess]);

  useEffect(() => {
    if (status !== 'authenticated' || !canAccess) return;
    setLoading(true);
    loadCandidates(statusFilter)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load MOM queue'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setError(null);
    setUploadMsg(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const result = await apiFetch<MomUploadResult>('/mom/uploads', { method: 'POST', body: formData });
      setUploadMsg(
        `${result.itemsFound} item${result.itemsFound === 1 ? '' : 's'} found — ${result.itemsNew} new added to the queue` +
          (result.itemsSkipped > 0 ? `, ${result.itemsSkipped} skipped as duplicates.` : '.'),
      );
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (statusFilter === 'PENDING') setCandidates((prev) => [...result.candidates, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process MOM PDF.');
    } finally {
      setUploading(false);
    }
  }

  async function onAccept(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/mom/candidates/${id}/accept`, { method: 'POST' });
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept item.');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    if (!window.confirm('Reject this item? It will be removed from the queue.')) return;
    setError(null);
    setBusyId(id);
    try {
      await apiFetch(`/mom/candidates/${id}/reject`, { method: 'POST' });
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject item.');
    } finally {
      setBusyId(null);
    }
  }

  function onSaved(updated: MomTaskCandidateSummary) {
    setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function readyToAccept(c: MomTaskCandidateSummary): boolean {
    return !!c.title && !!c.description && !!c.dueDate && !!c.suggestedAssigneeId;
  }

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <h1 className="mb-6 text-xl font-bold text-text">MOM</h1>

        {!canAccess ? (
          <p className="text-sm text-muted">Only admins and managers can access MOM uploads.</p>
        ) : (
          <>
            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

            <div className="mb-6 rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">Upload minutes of meeting</h2>
              <p className="mb-4 text-sm text-muted">
                Upload a MoM PDF. AI reads it, identifies action items and who&apos;s responsible for each, and adds
                them to the review queue below — nothing becomes a real task until you accept it.
              </p>
              <form onSubmit={onUpload} className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-text file:mr-3 file:rounded-card file:border file:border-border file:bg-surface-alt file:px-3 file:py-1.5 file:text-sm file:text-text"
                />
                <button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {uploading ? 'Reading & extracting…' : 'Upload & extract'}
                </button>
              </form>
              {uploadMsg && <p className="mt-3 text-sm text-green-600">{uploadMsg}</p>}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div className="flex overflow-hidden rounded-card border border-border text-sm">
                {MOM_CANDIDATE_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 ${statusFilter === s ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-text'}`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-muted">Loading…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted">
                {statusFilter === 'PENDING' ? 'Nothing in the queue — upload a MoM PDF to get started.' : 'Nothing here yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-alt text-muted">
                    <tr>
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2">Priority</th>
                      <th className="px-4 py-2">Due</th>
                      <th className="px-4 py-2">Assignee</th>
                      <th className="px-4 py-2">Source</th>
                      {statusFilter === 'PENDING' ? (
                        <th className="px-4 py-2" />
                      ) : (
                        <th className="px-4 py-2">Reviewed by</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} className="border-t border-border align-top">
                        <td className="max-w-xs px-4 py-2 text-text">
                          <div className="font-medium">
                            {c.status === 'ACCEPTED' && c.createdTaskId ? (
                              <Link href={`/tasks/${c.createdTaskId}`} className="hover:text-accent hover:underline">
                                {c.title}
                              </Link>
                            ) : (
                              c.title
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted">{c.description}</div>
                        </td>
                        <td className="px-4 py-2 text-text">{c.priority}</td>
                        <td className="px-4 py-2 text-muted">{formatDate(c.dueDate)}</td>
                        <td className="px-4 py-2 text-muted">
                          {c.suggestedAssigneeName ?? '—'}
                          {c.suggestedAssigneeName && !c.suggestedAssigneeId && (
                            <span className="ml-1 text-amber-600">(unmatched)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted">{c.momUploadFileName}</td>
                        {statusFilter === 'PENDING' ? (
                          <td className="px-4 py-2">
                            <div className="flex flex-col items-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => onAccept(c.id)}
                                disabled={busyId === c.id || !readyToAccept(c)}
                                title={!readyToAccept(c) ? 'Edit to complete required fields first' : undefined}
                                className="text-sm font-medium text-green-600 disabled:opacity-40"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCandidate(c)}
                                disabled={busyId === c.id}
                                className="text-sm text-accent"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onReject(c.id)}
                                disabled={busyId === c.id}
                                className="text-sm text-red-500"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        ) : (
                          <td className="px-4 py-2 text-xs text-muted">
                            {c.reviewedByName ?? '—'}
                            {c.reviewedAt && <div>{formatDate(c.reviewedAt)}</div>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingCandidate && (
              <EditCandidateModal
                candidate={editingCandidate}
                members={members}
                onClose={() => setEditingCandidate(null)}
                onSaved={onSaved}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
