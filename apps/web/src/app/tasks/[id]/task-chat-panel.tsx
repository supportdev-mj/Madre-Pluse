'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommentSummary, RoleName, TaskActivitySummary } from '@madre-pulse/shared';
import { apiFetch } from '../../../lib/api-client';
import { AttachmentPreview } from './attachment-preview';
import { AttachmentsModal } from './attachments-modal';

type FeedItem =
  | { kind: 'activity'; id: string; createdAt: string; activity: TaskActivitySummary }
  | { kind: 'comment'; id: string; createdAt: string; comment: CommentSummary };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TaskChatPanelProps {
  taskId: string;
  currentUserId?: string;
  role: RoleName | null;
}

export function TaskChatPanel({ taskId, currentUserId, role }: TaskChatPanelProps) {
  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [activities, setActivities] = useState<TaskActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [messageText, setMessageText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Drives the 10-second self-delete window on chat messages below — ticks the whole time the
  // panel is open so a message's Delete button disappears on its own once the window lapses.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadFeed() {
    const [cmts, acts] = await Promise.all([
      apiFetch<CommentSummary[]>(`/tasks/${taskId}/comments`),
      apiFetch<TaskActivitySummary[]>(`/tasks/${taskId}/activity`),
    ]);
    setComments(cmts);
    setActivities(acts);
  }

  useEffect(() => {
    setLoading(true);
    loadFeed()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ block: 'end' });
  }, [comments.length, activities.length, loading]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        setPendingFiles((prev) => [...prev, file]);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setError('Could not access the microphone — check your browser permissions.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function onSend() {
    const text = messageText.trim();
    if (!text && pendingFiles.length === 0) return;
    setError(null);
    setSending(true);
    try {
      const comment = await apiFetch<CommentSummary>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: text || undefined }),
      });
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('commentId', comment.id);
        await apiFetch(`/tasks/${taskId}/attachments`, { method: 'POST', body: formData });
      }
      setMessageText('');
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  async function onDeleteComment(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/comments/${id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment.');
    }
  }

  const feed: FeedItem[] = [
    ...activities.map((a): FeedItem => ({ kind: 'activity', id: a.id, createdAt: a.createdAt, activity: a })),
    ...comments.map((c): FeedItem => ({ kind: 'comment', id: c.id, createdAt: c.createdAt, comment: c })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const canManage = role === 'ADMIN' || role === 'MANAGER';

  // A message's author can delete it only within 10 seconds of sending; after that only an admin can.
  function canDeleteComment(c: CommentSummary): boolean {
    if (role === 'ADMIN') return true;
    if (c.authorId !== currentUserId) return false;
    return nowTick - new Date(c.createdAt).getTime() < 10_000;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-card border border-border bg-surface lg:sticky lg:top-24">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text">Activity</h2>
        <button
          type="button"
          onClick={() => setShowAttachmentsModal(true)}
          className="flex items-center gap-1.5 rounded-card border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-alt"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-4 w-4">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
            />
          </svg>
          View attachments
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="text-sm text-muted">No activity yet — say something below.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {feed.map((item) =>
              item.kind === 'activity' ? (
                <p key={item.id} className="text-center text-xs text-muted">
                  <span className="text-text">{item.activity.actorName}</span> {item.activity.message} ·{' '}
                  {formatTime(item.createdAt)}
                </p>
              ) : (
                <div key={item.id} className={`flex gap-2 ${item.comment.authorId === currentUserId ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: item.comment.authorAvatarColor }}
                  >
                    {item.comment.authorInitials}
                  </div>
                  <div
                    className={`flex max-w-[80%] flex-col gap-2 rounded-card p-3 text-sm ${
                      item.comment.authorId === currentUserId ? 'bg-accent text-white' : 'bg-surface-alt text-text'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-3 text-xs ${
                        item.comment.authorId === currentUserId ? 'text-white/70' : 'text-muted'
                      }`}
                    >
                      <span className="font-medium">{item.comment.authorName}</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                    {item.comment.body && <p className="whitespace-pre-wrap">{item.comment.body}</p>}
                    {item.comment.attachments.map((a) => (
                      <AttachmentPreview key={a.id} taskId={taskId} attachment={a} />
                    ))}
                    {canDeleteComment(item.comment) && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(item.comment.id)}
                        className={`self-start text-xs ${item.comment.authorId === currentUserId ? 'text-white/80 hover:text-white' : 'text-red-500'}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={feedEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-2.5 pr-1.5 text-xs text-text">
                {f.name}
                <button type="button" onClick={() => removePendingFile(i)} aria-label="Remove file" className="text-muted hover:text-text">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {recording && (
          <div className="mb-2 flex items-center gap-2 text-xs text-red-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording… {formatSeconds(recordingSeconds)}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a file"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-border text-muted hover:bg-surface-alt hover:text-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-[18px] w-[18px]">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
              />
            </svg>
          </button>

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type your message here"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? 'Stop recording' : 'Record a voice note'}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card border ${
              recording ? 'border-red-300 bg-red-50 text-red-500' : 'border-border text-muted hover:bg-surface-alt hover:text-text'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-[18px] w-[18px]">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={onSend}
            disabled={sending || (!messageText.trim() && pendingFiles.length === 0)}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-accent text-white disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-[18px] w-[18px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>

      {showAttachmentsModal && (
        <AttachmentsModal
          taskId={taskId}
          canDelete={(a) => canManage || a.uploadedById === currentUserId}
          onClose={() => setShowAttachmentsModal(false)}
        />
      )}
    </div>
  );
}
