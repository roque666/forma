import type { ReactNode } from 'react';
import { AppShell } from '@/components/nav/app-shell';
import { requireUser } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
