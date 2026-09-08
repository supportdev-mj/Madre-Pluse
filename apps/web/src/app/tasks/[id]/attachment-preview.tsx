'use client';

import { useEffect, useState } from 'react';
import type { AttachmentSummary } from '@madre-pulse/shared';
import { apiFetch } from '../../../lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentPreviewProps {
  taskId: string;
  attachment: AttachmentSummary;
}

/** Fetches a short-lived signed download URL on mount and renders the file inline by type
 * (image/video/audio players, or a plain file chip for anything else, e.g. PDFs). */
export function AttachmentPreview({ taskId, attachment }: AttachmentPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ url: string }>(`/tasks/${taskId}/attachments/${attachment.id}/download-url`)
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {
        // Best-effort — a failed preview just falls back to the plain file chip below.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id]);

  if (attachment.mimeType.startsWith('image/')) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.fileName} className="max-h-56 max-w-full rounded-card border border-border" />
      </a>
    ) : (
      <div className="h-24 w-40 animate-pulse rounded-card bg-surface" />
    );
  }

  if (attachment.mimeType.startsWith('video/')) {
    return url ? (
      <video controls src={url} className="max-h-56 max-w-full rounded-card border border-border" />
    ) : (
      <div className="h-24 w-40 animate-pulse rounded-card bg-surface" />
    );
  }

  if (attachment.mimeType.startsWith('audio/')) {
    return url ? (
      <audio controls src={url} className="h-9 max-w-full" />
    ) : (
      <div className="h-9 w-56 animate-pulse rounded-full bg-surface" />
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2 text-xs ${url ? 'hover:border-accent' : 'pointer-events-none opacity-60'}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-4 w-4 shrink-0">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <span className="truncate">{attachment.fileName}</span>
      <span className="shrink-0 text-muted">{formatBytes(attachment.sizeBytes)}</span>
    </a>
  );
}
