import { Users } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { listPatients } from '@/lib/physio/physio';
import { endPhysioLinkAction } from '@/lib/actions/physio';
import { requirePhysioPage, weekOf } from '@/lib/physio/page';
import { formatDatePt, isoToLocalDate, relativeDayLabel } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { InvitePatientForm } from '@/components/physio/physio-forms';

export const metadata = { title: 'Pacientes' };

export default async function PatientsPage() {
  const user = await requirePhysioPage();
  const w = weekOf(user.timezone);
  const rows = await withUser(user.id, (db) => listPatients(db, w.weekStart, w.weekEnd));
  const active = rows.filter((r) => r.status === 'active');
  const pending = rows.filter((r) => r.status === 'pending');
  return (
    <>
      <PageHeader title="Pacientes" subtitle={`${active.length} ${active.length === 1 ? 'paciente ativo' : 'pacientes ativos'}${pending.length ? ` · ${pending.length} convite(s) pendente(s)` : ''}`} />
      {active.length === 0 ? <div className="mb-6"><EmptyState icon={<Users className="h-8 w-8" />} title="Ainda não tens pacientes" description="Convida um paciente pelo email da conta dele para lhe atribuíres exercícios." /></div> : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((r) => {
            const last = r.lastLogAt ? relativeDayLabel(isoToLocalDate(r.lastLogAt, user.timezone), w.today) : 'nunca';
            return (
              <LinkCard key={r.linkId} href={`/patients/${r.patientId}`} data-testid="patient-card">
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={r.fullName ?? '?'} src={r.avatarUrl} />
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.fullName}</p><p className="truncate text-xs text-muted">{r.programs} {r.programs === 1 ? 'programa' : 'programas'}</p></div>
                  {r.lastPain != null && r.lastPain >= 7 && <Badge tone="danger">Dor {r.lastPain}/10</Badge>}
                </div>
                {r.weekTarget > 0 ? <div className="space-y-1"><div className="flex justify-between text-xs"><span className="text-muted">Esta semana</span><span className="font-semibold">{r.weekDone}/{r.weekTarget}</span></div><ProgressBar value={Math.min(r.weekDone, r.weekTarget)} max={r.weekTarget} label="Exercícios desta semana" /></div> : <p className="text-xs text-muted">Sem exercícios atribuídos</p>}
                <p className="mt-3 text-xs text-muted">Último registo: <span className="font-semibold text-fg">{last}</span></p>
              </LinkCard>
            );
          })}
        </div>
      )}
      {pending.length > 0 && (
        <Card className="mb-6"><CardTitle>Convites pendentes</CardTitle>
          <ul className="divide-y divide-line">{pending.map((r) => (
            <li key={r.linkId} className="flex items-center justify-between gap-2 py-2.5 text-sm"><span><strong>{r.inviteEmail}</strong><span className="ml-2 text-xs text-muted">desde {formatDatePt(isoToLocalDate(r.since, user.timezone))}</span></span>
              <form action={endPhysioLinkAction}><input type="hidden" name="id" value={r.linkId} /><ConfirmSubmit confirmLabel="Cancelar convite?">Cancelar</ConfirmSubmit></form></li>))}</ul></Card>
      )}
      <Card className="max-w-xl"><CardTitle>Convidar paciente</CardTitle><InvitePatientForm /></Card>
    </>
  );
}
