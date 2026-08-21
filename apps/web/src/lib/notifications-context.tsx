'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { NotificationSummary } from '@madre-pulse/shared';
import { apiFetch, getAccessToken } from './api-client';
import { useAuth } from './auth-context';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

interface NotificationsContextValue {
  notifications: NotificationSummary[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      setNotifications([]);
      return;
    }

    apiFetch<NotificationSummary[]>('/notifications')
      .then(setNotifications)
      .catch(() => {
        // Notifications are supplementary — a failed initial load isn't worth surfacing an error banner for.
      });

    const socket = io(SOCKET_URL, {
      autoConnect: true,
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    socketRef.current = socket;

    socket.on('notification', (notification: NotificationSummary) => {
      setNotifications((prev) => [notification, ...prev]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await apiFetch(`/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
    } catch {
      // Best-effort — a failed mark-read isn't worth reverting the optimistic update over.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
    } catch {
      // Best-effort, same as markRead.
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
