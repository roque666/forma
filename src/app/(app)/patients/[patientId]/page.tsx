import { notFound } from 'next/navigation';
import Link from 'next/link';
import { withUser } from '@/lib/db/pool';
import { getPatient, listLogs, listPrograms, painByDay } from '@/lib/physio/physio';
import { endPhysioLinkAction } from '@/lib/actions/physio';
import { idParam, requirePhysioPage, weekOf } from '@/lib/physio/page';
import { addDays, formatDatePt, formatDateTimePt } from '@/lib/dates';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { TrendChart } from '@/components/charts/trend-chart';
import { NewProgramForm } from '@/components/physio/physio-forms';

export const metadata = { title: 'Paciente' };

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const user = await requirePhysioPage();
  const patientId = idParam((await params).patientId);
  const w = weekOf(user.timezone);
  const d = await withUser(user.id, async (db) => {
    const patient = await getPatient(db, patientId);
    if (!patient) return null;
    const link = await db.one<{ id: string }>(`select id from public.physio_patients where physio_id = auth.uid () and patient_id = $1 and status = 'active'`, [patientId]);
    return {
      patient, linkId: link!.id,
      programs: await listPrograms(db, patientId, w, { includeArchived: true }),
      logs: await listLogs(db, patientId, { limit: 25 }),
      pain: await painByDay(db, patientId, addDays(w.today, -29)),
    };
  });
  if (!d) notFound();
  const live = d.programs.filter((p) => !p.archived);
  const archived = d.programs.filter((p) => p.archived);
  const chart = d.pain.map((p) => ({ label: formatDatePt(p.day), pain: p.pain }));
  return (
    <>
      <PageHeader title={d.patient.fullName} subtitle="Exercícios atribuídos e progresso" back={{ href: '/patients', label: 'Pacientes' }}
        actions={<form action={endPhysioLinkAction}><input type="hidden" name="id" value={d.linkId} /><ConfirmSubmit confirmLabel="Terminar acompanhamento?">Terminar acompanhamento</ConfirmSubmit></form>} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2"><CardTitle>Programas</CardTitle>
          {live.length === 0 ? <p className="text-sm text-muted">Ainda não há programas. Cria o primeiro abaixo.</p> : (
            <ul className="divide-y divide-line">{live.map((p) => {
              const target = p.items.reduce((s, i) => s + i.weeklyTarget, 0);
              const done = p.items.reduce((s, i) => s + Math.min(i.weekDone, i.weeklyTarget), 0);
              return (
                <li key={p.id}><Link href={`/patients/${patientId}/programs/${p.id}`} data-testid="program-link" className="block space-y-1.5 py-3 hover:opacity-80">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{p.name}</span><span className="text-xs text-muted">{p.items.length} {p.items.length === 1 ? 'exercício' : 'exercícios'}</span></div>
                  {target > 0 && <div className="flex items-center gap-3"><div className="flex-1"><ProgressBar value={done} max={target} label={`Progresso de ${p.name}`} /></div><span className="text-xs font-semibold tabular-nums">{done}/{target}</span></div>}
                </Link></li>);
            })}</ul>)}
        </Card>
        <Card><CardTitle>Novo programa</CardTitle><NewProgramForm patientId={patientId} /></Card>
        <Card><CardTitle>Dor reportada (30 dias)</CardTitle>
          {chart.length === 0 ? <p className="text-sm text-muted">O paciente ainda não indicou dor nos registos.</p> : <TrendChart data={chart} type="line" unit="/10" domain={[0, 10]} series={[{ key: 'pain', name: 'Dor média' }]} />}</Card>
        <Card className="lg:col-span-2"><CardTitle>Registos recentes</CardTitle>
          {d.logs.length === 0 ? <EmptyState title="Sem registos ainda" description="Quando o paciente marcar exercícios como feitos, aparecem aqui." /> : (
            <ul className="divide-y divide-line">{d.logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm" data-testid="rehab-log">
                <span><strong>{l.exerciseName}</strong><span className="ml-2 text-xs text-muted">{l.programName} · {formatDateTimePt(l.doneAt, user.timezone)}</span>{l.note && <span className="block text-xs text-muted">“{l.note}”</span>}</span>
                {l.pain != null && <Badge tone={l.pain >= 7 ? 'danger' : l.pain >= 4 ? 'warn' : 'ok'}>Dor {l.pain}/10</Badge>}</li>))}</ul>)}
        </Card>
        {archived.length > 0 && <Card className="lg:col-span-2"><CardTitle>Arquivados</CardTitle><ul className="divide-y divide-line">{archived.map((p) => <li key={p.id}><Link href={`/patients/${patientId}/programs/${p.id}`} className="block py-2.5 text-sm text-muted hover:opacity-80">{p.name}</Link></li>)}</ul></Card>}
      </div>
    </>
  );
}
