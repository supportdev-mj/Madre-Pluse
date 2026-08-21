'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from './notification-bell';
import { useAuth } from '../lib/auth-context';

const links = [
  { href: '/', label: 'Home' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/team', label: 'Team' },
  { href: '/clients', label: 'Clients' },
  { href: '/projects', label: 'Projects' },
];

const managerLinks = [{ href: '/dashboard', label: 'Dashboard' }];

export function AppNav() {
  const { org, role, logout } = useAuth();
  const pathname = usePathname();
  const visibleLinks = role === 'ADMIN' || role === 'MANAGER' ? [...links, ...managerLinks] : links;

  return (
    <nav className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="font-bold text-text">{org?.name ?? 'Madre Pulse'}</span>
        <div className="flex gap-4 text-sm">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? 'font-medium text-accent' : 'text-muted hover:text-text'}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <button type="button" onClick={() => logout()} className="text-sm text-muted hover:text-text">
          Log out
        </button>
      </div>
    </nav>
  );
}
