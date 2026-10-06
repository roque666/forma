import { HeartPulse } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listLogs, listPrograms, myPendingPhysioInvites, myPhysios } from '@/lib/physio/physio';
import { acceptPhysioInviteAction, endPhysioLinkAction, undoRehabLogAction } from '@/lib/actions/physio';
import { weekOf } from '@/lib/physio/page';
import { prescriptionText } from '@/lib/physio/labels';
import { formatDateTimePt } from '@/lib/dates';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Alert, Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ExercisePhoto, VideoEmbed } from '@/components/training/exercise-media';
import { RehabLogForm } from '@/components/physio/physio-forms';

export const metadata = { title: 'Reabilitação' };

export default async function RehabPage() {
  const user = await requireUser();
  const w = weekOf(user.timezone);
  const d = await withUser(user.id, async (db) => ({
    invites: await myPendingPhysioInvites(db), physios: await myPhysios(db, user.id),
    programs: await listPrograms(db, user.id, w), logs: await listLogs(db, user.id, { limit: 15 }),
  }));
  return (
    <>
      <PageHeader title="Reabilitação" subtitle="Exercícios do teu fisioterapeuta, ao teu ritmo" />
      {d.invites.map((i) => (
        <Alert key={i.linkId} tone="info" className="mb-4"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{i.physioName}</strong> (fisioterapeuta) quer atribuir-te exercícios. Ao aceitar, ele vê os exercícios que registares aqui — nada de treinos, nutrição ou peso.</span>
          <span className="flex gap-2"><form action={acceptPhysioInviteAction}><input type="hidden" name="id" value={i.linkId} /><Button type="submit" size="sm">Aceitar</Button></form>
            <form action={endPhysioLinkAction}><input type="hidden" name="id" value={i.linkId} /><Button type="submit" size="sm" variant="outline">Recusar</Button></form></span></div></Alert>
      ))}
      {d.programs.length === 0 ? (
        <EmptyState icon={<HeartPulse className="h-8 w-8" />} title="Sem exercícios atribuídos" description={d.physios.length ? 'O teu fisioterapeuta ainda não te atribuiu nenhum programa.' : 'Quando um fisioterapeuta te convidar (com o email desta conta) e aceitares, os exercícios aparecem aqui.'} />
      ) : (
        <div className="space-y-6">
          {d.programs.map((p) => {
            const target = p.items.reduce((s, i) => s + i.weeklyTarget, 0);
            const done = p.items.reduce((s, i) => s + Math.min(i.weekDone, i.weeklyTarget), 0);
            return (
              <section key={p.id} aria-label={p.name} data-testid="rehab-program" className="space-y-3">
                <div><h2 className="text-lg font-bold">{p.name}</h2><p className="text-sm text-muted">de {p.physioName ?? 'fisioterapeuta'}</p>
                  {p.notes && <p className="mt-1 text-sm">{p.notes}</p>}
                  {target > 0 && <div className="mt-2 flex items-center gap-3"><div className="flex-1"><ProgressBar value={done} max={target} label={`Progresso de ${p.name}`} /></div><span className="text-sm font-semibold tabular-nums">{done}/{target} esta semana</span></div>}</div>
                {p.items.length === 0 && <p className="text-sm text-muted">Programa ainda sem exercícios.</p>}
                {p.items.map((it) => (
                  <Card key={it.id} data-testid="rehab-item">
                    <div className="flex items-start gap-3">
                      <ExercisePhoto images={it.images} alt="" className="h-20 w-20 shrink-0" />
                      <div className="min-w-0 flex-1"><p className="font-semibold">{it.exerciseName}</p><p className="text-sm text-muted">{prescriptionText(it)}</p>
                        <p className="mt-1 text-xs"><Badge tone={it.weekDone >= it.weeklyTarget ? 'ok' : 'neutral'}>{it.weekDone}/{it.weeklyTarget} esta semana</Badge>{it.todayDone && <span className="ml-2 text-ok">feito hoje</span>}</p></div>
                    </div>
                    {it.notes && <p className="mt-3 rounded-xl bg-accent/10 p-3 text-sm">{it.notes}</p>}
                    {(it.instructions || it.mediaUrl) && (
                      <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-accent-text">Como fazer</summary>
                        <div className="mt-2 space-y-3">{it.instructions && <p className="whitespace-pre-line text-sm text-muted">{it.instructions}</p>}{it.mediaUrl && <VideoEmbed url={it.mediaUrl} title={it.exerciseName} />}</div></details>)}
                    <div className="mt-4 border-t border-line pt-4"><RehabLogForm itemId={it.id} /></div>
                  </Card>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {d.logs.length > 0 && (
        <Card className="mt-6"><CardTitle>Os meus registos</CardTitle>
          <ul className="divide-y divide-line">{d.logs.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm" data-testid="rehab-log">
              <span><strong>{l.exerciseName}</strong><span className="ml-2 text-xs text-muted">{formatDateTimePt(l.doneAt, user.timezone)}</span>{l.pain != null && <span className="ml-2 text-xs text-muted">dor {l.pain}/10</span>}{l.note && <span className="block text-xs text-muted">“{l.note}”</span>}</span>
              <form action={undoRehabLogAction}><input type="hidden" name="id" value={l.id} /><Button type="submit" size="sm" variant="outline">Desfazer</Button></form></li>))}</ul></Card>
      )}
    </>
  );
}
