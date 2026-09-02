'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthOrg, AuthUser, LoginInput, RegisterInput, RoleName } from '@madre-pulse/shared';
import { apiFetch, setAccessToken } from './api-client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionResponse {
  user: AuthUser;
  org: AuthOrg;
  role: RoleName;
  accessToken: string;
}

interface MeResponse {
  user: AuthUser;
  org: AuthOrg;
  role: RoleName;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  org: AuthOrg | null;
  role: RoleName | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setOrgName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<AuthOrg | null>(null);
  const [role, setRole] = useState<RoleName | null>(null);

  const applySession = useCallback((session: SessionResponse | MeResponse) => {
    setUser(session.user);
    setOrg(session.org);
    setRole(session.role);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setOrg(null);
    setRole(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('no session');
        const { accessToken } = (await res.json()) as { accessToken: string };
        setAccessToken(accessToken);
        const me = await apiFetch<MeResponse>('/auth/me');
        applySession(me);
      } catch {
        clearSession();
      }
    })();
  }, [applySession, clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      const session = await apiFetch<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) });
      setAccessToken(session.accessToken);
      applySession(session);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const session = await apiFetch<SessionResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
      setAccessToken(session.accessToken);
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const setOrgName = useCallback((name: string) => {
    setOrg((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, org, role, login, register, logout, setOrgName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
