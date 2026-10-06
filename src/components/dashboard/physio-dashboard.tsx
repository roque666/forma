import { AlertTriangle, Users } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listPatients } from '@/lib/physio/physio';
import { weekOf } from '@/lib/physio/page';
import { addDays, isoToLocalDate, daysBetween, relativeDayLabel } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { EmptyState, Stat } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import Link from 'next/link';

export async function PhysioDashboard({ user }: { user: SessionUser }) {
  const w = weekOf(user.timezone);
  const rows = await withUser(user.id, (db) => listPatients(db, w.weekStart, w.weekEnd));
  const active = rows.filter((r) => r.status === 'active');
  const pending = rows.length - active.length;
  const lastDay = (iso: string | null) => (iso ? isoToLocalDate(iso, user.timezone) : null);
  const alerts = active.filter((r) => {
    if (r.lastPain != null && r.lastPain >= 7) return true;
    if (r.weekTarget === 0) return false;
    const l = lastDay(r.lastLogAt);
    return !l || daysBetween(l, w.today) >= 5;
  });
  const target = active.reduce((s, r) => s + r.weekTarget, 0);
  const done = active.reduce((s, r) => s + Math.min(r.weekDone, r.weekTarget), 0);
  return (
    <>
      <PageHeader title={`Olá, ${user.fullName.split(' ')[0]} 👋`} subtitle="Visão geral dos teus pacientes" actions={<LinkButton href="/patients" variant="outline"><Users className="h-4 w-4" /> Pacientes</LinkButton>} />
      {active.length === 0 ? <EmptyState icon={<Users className="h-8 w-8" />} title="Ainda não tens pacientes" description="Convida um paciente pelo email para começares a atribuir exercícios e a acompanhar o progresso." action={<LinkButton href="/patients">Convidar paciente</LinkButton>} /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <LinkCard href="/patients"><CardTitle>Pacientes ativos</CardTitle><Stat label="Total" value={active.length} hint={pending ? `${pending} convite(s) pendente(s)` : undefined} /></LinkCard>
          <LinkCard href="/patients"><CardTitle>Exercícios esta semana</CardTitle><Stat label="Feitos / previstos" value={`${done}/${target}`} /></LinkCard>
          <LinkCard href="/patients"><CardTitle>Precisam de atenção</CardTitle><Stat label="Pacientes" value={alerts.length} tone={alerts.length ? 'warn' : 'ok'} hint={alerts.length ? undefined : 'tudo em dia'} /></LinkCard>
          {alerts.length > 0 && (
            <Card className="md:col-span-3"><CardTitle action={<AlertTriangle className="h-4 w-4 text-warn" />}>Atenção</CardTitle>
              <ul className="divide-y divide-line">{alerts.map((r) => {
                const l = lastDay(r.lastLogAt);
                const why = r.lastPain != null && r.lastPain >= 7 ? `dor ${r.lastPain}/10 no último registo` : l ? `sem registos desde ${relativeDayLabel(l, w.today)}` : 'ainda sem registos';
                return <li key={r.linkId}><Link href={`/patients/${r.patientId}`} className="flex justify-between gap-2 py-2.5 text-sm hover:opacity-80"><strong>{r.fullName}</strong><span className="text-warn">{why}</span></Link></li>;
              })}</ul></Card>)}
        </div>
      )}
    </>
  );
}
