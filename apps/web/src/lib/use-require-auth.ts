'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './auth-context';

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [auth.status, router]);

  return auth;
}
