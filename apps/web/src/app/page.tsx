'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoLoader } from '../components/logo-loader';
import { useRequireAuth } from '../lib/use-require-auth';

export default function Home() {
  const { status, role } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated' || !role) return;
    router.replace(role === 'ADMIN' || role === 'MANAGER' ? '/dashboard' : '/tasks');
  }, [status, role, router]);

  return <LogoLoader />;
}
