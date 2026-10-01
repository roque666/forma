import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listStudentOverview } from '@/lib/data/coach';
import { getThresholds, withFollowUp } from '@/lib/services/coach';
import { FOLLOWUP_LABELS_PT, FOLLOWUP_REASON_LABELS_PT, type FollowUpStatus } from '@/lib/coach/followup';
import { endLinkAction } from '@/lib/actions/coach';
import { formatDatePt, isoToLocalDate, relativeDayLabel, todayInTz } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, type Tone } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { CreateStudentForm, InviteForm, ThresholdsForm } from '@/components/coach/student-forms';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';
import { Users } from 'lucide-react';

export const metadata = { title: 'Meus atletas' };

const TONE: Record<FollowUpStatus, Tone> = { on_track: 'ok', attention: 'warn', inactive: 'danger', pending: 'neutral' };

export default async function StudentsPage() {
  const user = await requireUser();
  if (user.role !== 'coach') redirect('/dashboard');
  const today = todayInTz(user.timezone);
  const { rows, thresholds } = await withUser(user.id, async (db) => ({ rows: await listStudentOverview(db), thresholds: await getThresholds(db, user.id) }));
  const list = withFollowUp(rows, today, thresholds, user.timezone);
  const active = list.filter((r) => r.linkStatus === 'active');
  const pending = list.filter((r) => r.linkStatus === 'pending');
  const ago = (iso: string | null) => (iso ? relativeDayLabel(isoToLocalDate(iso, user.timezone), today) : 'nunca');
  return (
    <>
      <PageHeader title="Meus atletas" subtitle={`${active.length} ${active.length === 1 ? 'atleta ativo' : 'atletas ativos'}${pending.length ? ` · ${pending.length} convite(s) pendente(s)` : ''}`} />
      {active.length === 0 ? <div className="mb-6"><EmptyState icon={<Users className="h-8 w-8" />} title="Ainda não tens atletas" description="Convida um atleta por email ou cria-lhe uma conta com palavra-passe temporária." /></div> : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((r) => (
            <LinkCard key={r.linkId} href={`/students/${r.studentId}`} data-testid="student-card">
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={r.fullName ?? '?'} src={r.avatarUrl} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.fullName}</p><p className="truncate text-xs text-muted">{r.currentPlanName ?? 'Sem plano atual'}</p></div>
                <Badge tone={TONE[r.followUp.status]}>{FOLLOWUP_LABELS_PT[r.followUp.status]}</Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted">Último treino</dt><dd className="font-semibold">{ago(r.lastWorkoutAt)}</dd></div>
                <div><dt className="text-muted">Refeições</dt><dd className="font-semibold">{r.lastMealDate ? relativeDayLabel(r.lastMealDate, today) : 'nunca'}</dd></div>
                <div><dt className="text-muted">Peso</dt><dd className="font-semibold">{r.currentWeightKg ? `${fmtNum(r.currentWeightKg, 1)} kg` : '—'}</dd></div></dl>
              {(r.goalType || r.followUp.reasons.length > 0) && <p className="mt-3 text-xs text-muted">{r.goalType && <>{GOAL_LABELS[r.goalType]} · {fmtNum(r.caloriesTarget, 0)} kcal</>}{r.followUp.reasons.length > 0 && <span className="block text-warn">{r.followUp.reasons.slice(0, 2).map((x) => FOLLOWUP_REASON_LABELS_PT[x]).join(' · ')}</span>}</p>}
            </LinkCard>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <Card className="mb-6"><CardTitle>Convites pendentes</CardTitle>
          <ul className="divide-y divide-line">{pending.map((r) => (
            <li key={r.linkId} className="flex items-center justify-between gap-2 py-2.5 text-sm"><span><strong>{r.inviteEmail ?? r.fullName}</strong><span className="ml-2 text-xs text-muted">desde {formatDatePt(isoToLocalDate(r.linkedAt, user.timezone))}</span></span>
              <form action={endLinkAction}><input type="hidden" name="id" value={r.linkId} /><ConfirmSubmit confirmLabel="Cancelar convite?">Cancelar</ConfirmSubmit></form></li>))}</ul></Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle>Convidar por email</CardTitle><InviteForm /></Card>
        <Card><CardTitle>Criar conta para um atleta</CardTitle><CreateStudentForm /></Card>
      </div>
      <details className="mt-4 rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-semibold">Limites dos alertas de acompanhamento</summary><div className="mt-3 max-w-md"><ThresholdsForm t={thresholds} /></div></details>
    </>
  );
}
