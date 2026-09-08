'use client';

import { useEffect, useState } from 'react';
import type { AttachmentSummary } from '@madre-pulse/shared';
import { apiFetch } from '../../../lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentsModalProps {
  taskId: string;
  canDelete: (a: AttachmentSummary) => boolean;
  onClose: () => void;
}

export function AttachmentsModal({ taskId, canDelete, onClose }: AttachmentsModalProps) {
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AttachmentSummary[]>(`/tasks/${taskId}/attachments`)
      .then(setAttachments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load attachments'))
      .finally(() => setLoading(false));
  }, [taskId]);

  async function onDownload(id: string) {
    try {
      const { url } = await apiFetch<{ url: string }>(`/tasks/${taskId}/attachments/${id}/download-url`);
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get download link.');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/attachments/${id}`, { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attachment.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-lg rounded-card border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">All attachments</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-card p-1 text-muted hover:bg-surface-alt hover:text-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted">No files shared on this task yet.</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-card border border-border p-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => onDownload(a.id)}
                  className="flex-1 truncate text-left text-text hover:text-accent hover:underline"
                >
                  {a.fileName}
                </button>
                <span className="shrink-0 text-xs text-muted">{formatBytes(a.sizeBytes)}</span>
                <span className="shrink-0 text-xs text-muted">{a.uploadedByName}</span>
                {canDelete(a) && (
                  <button type="button" onClick={() => onDelete(a.id)} className="shrink-0 text-xs text-red-500">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
