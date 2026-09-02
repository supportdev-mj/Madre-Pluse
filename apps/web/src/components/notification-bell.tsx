'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { NotificationSummary } from '@madre-pulse/shared';
import { useNotifications } from '../lib/notifications-context';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function onNotificationClick(n: NotificationSummary) {
    if (!n.read) markRead(n.id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-alt text-text hover:brightness-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]">
          <path
            fillRule="evenodd"
            d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z"
            clipRule="evenodd"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="text-sm font-bold text-text">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllRead()} className="text-xs font-medium text-accent">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-muted">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const content = (
                  <div className={`rounded-lg border-t border-border px-2.5 py-2 text-sm first:border-t-0 ${n.read ? '' : 'bg-surface-alt'}`}>
                    <p className="text-text">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted">{timeAgo(n.createdAt)}</p>
                  </div>
                );
                return n.taskId ? (
                  <Link key={n.id} href={`/tasks/${n.taskId}`} onClick={() => onNotificationClick(n)}>
                    {content}
                  </Link>
                ) : (
                  <button key={n.id} type="button" onClick={() => onNotificationClick(n)} className="block w-full text-left">
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
