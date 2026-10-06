import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { logoutAction, setViewModeAction } from '@/lib/auth/actions';
import type { SessionUser } from '@/lib/auth/session';
import { Avatar } from '@/components/ui/avatar';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface2 hover:text-fg" aria-label="Terminar sessão">
        <LogOut className="h-4 w-4" /> {!compact && 'Sair'}
      </button>
    </form>
  );
}

function ModeSwitch({ user }: { user: SessionUser }) {
  if (user.realRole !== 'coach') return null;
  const personal = user.role === 'student';
  return (
    <form action={setViewModeAction} className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm">
      <span className="min-w-0 truncate text-muted">{personal ? 'A ver: ' : 'Modo: '}<strong className="text-fg">{personal ? 'O meu treino' : 'Coach'}</strong></span>
      <input type="hidden" name="mode" value={personal ? 'coach' : 'personal'} />
      <button className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent-text hover:bg-surface2">
        <ArrowLeftRight className="h-3.5 w-3.5" /> {personal ? 'Voltar a coach' : 'O meu treino'}
      </button>
    </form>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const userBlock = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={user.fullName || user.email} src={user.avatarUrl} size={36} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{user.fullName || user.email}</p>
        <p className="text-xs text-muted">{user.role === 'coach' ? 'Coach' : user.role === 'physio' ? 'Fisioterapeuta' : 'Atleta'}</p>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh">
      <Sidebar role={user.role} userBlock={userBlock} />
      <div className="md:pl-64">
        <div className="hidden justify-end px-8 pt-4 md:flex"><LogoutButton /></div>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-12 md:pt-2"><ModeSwitch user={user} />
        {children}</main>
      </div>
      <BottomNav role={user.role} logout={<LogoutButton />} />
    </div>
  );
}
