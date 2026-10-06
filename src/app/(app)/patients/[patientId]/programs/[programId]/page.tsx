import { notFound } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { withUser } from '@/lib/db/pool';
import { listExercises } from '@/lib/data/exercises';
import { getPatient, getProgram } from '@/lib/physio/physio';
import { archiveProgramAction, deleteProgramAction, moveProgramItemAction, removeProgramItemAction } from '@/lib/actions/physio';
import { idParam, requirePhysioPage, weekOf } from '@/lib/physio/page';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState, ProgressBar } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ExercisePhoto } from '@/components/training/exercise-media';
import { MoveButtons } from '@/components/training/plan-editor';
import { AddRehabExerciseButton, ProgramEditForm, RehabItemForm } from '@/components/physio/physio-forms';
import { prescriptionText } from '@/lib/physio/labels';

export const metadata = { title: 'Programa de exercícios' };

export default async function ProgramPage({ params }: { params: Promise<{ patientId: string; programId: string }> }) {
  const user = await requirePhysioPage();
  const p = await params;
  const patientId = idParam(p.patientId);
  const programId = idParam(p.programId);
  const w = weekOf(user.timezone);
  const d = await withUser(user.id, async (db) => ({
    patient: await getPatient(db, patientId), program: await getProgram(db, programId, w), exercises: await listExercises(db),
  }));
  if (!d.patient || !d.program || d.program.patientId !== patientId) notFound();
  const program = d.program;
  const picker = d.exercises.map((e) => ({ id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, equipment: e.equipment, source: e.source, images: e.images }));
  const target = program.items.reduce((s, i) => s + i.weeklyTarget, 0);
  const done = program.items.reduce((s, i) => s + Math.min(i.weekDone, i.weeklyTarget), 0);
  return (
    <>
      <PageHeader title={program.name} subtitle={<>Para {d.patient.fullName} {program.archived && <Badge tone="neutral">Arquivado</Badge>}</>} back={{ href: `/patients/${patientId}`, label: d.patient.fullName }} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          {target > 0 && <Card><div className="flex items-center gap-3"><span className="text-sm font-semibold">Esta semana</span><div className="flex-1"><ProgressBar value={done} max={target} label="Progresso da semana" /></div><span className="text-sm font-semibold tabular-nums">{done}/{target}</span></div></Card>}
          {program.items.length === 0 && <EmptyState title="Programa vazio" description="Adiciona os exercícios que o paciente deve ir fazendo ao longo da semana." />}
          {program.items.map((it) => (
            <Card key={it.id} data-testid="rehab-item">
              <div className="flex items-start gap-3">
                <ExercisePhoto images={it.images} alt="" className="h-16 w-16 shrink-0" />
                <div className="min-w-0 flex-1"><p className="font-semibold">{it.exerciseName}</p><p className="text-sm text-muted">{prescriptionText(it)}</p><p className="text-xs text-muted">Feito {it.weekDone}× esta semana</p></div>
                <MoveButtons action={moveProgramItemAction.bind(null, patientId)} id={it.id} />
                <form action={removeProgramItemAction.bind(null, patientId)}><input type="hidden" name="id" value={it.id} /><ConfirmSubmit confirmLabel="Remover?" aria-label={`Remover ${it.exerciseName}`}><Trash2 className="h-4 w-4" /></ConfirmSubmit></form>
              </div>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-accent-text">Editar prescrição</summary><div className="mt-3"><RehabItemForm patientId={patientId} item={it} /></div></details>
            </Card>
          ))}
          {!program.archived && <AddRehabExerciseButton patientId={patientId} programId={program.id} exercises={picker} />}
        </div>
        <div className="space-y-4">
          <Card><CardTitle>Detalhes</CardTitle><ProgramEditForm patientId={patientId} programId={program.id} name={program.name} notes={program.notes} /></Card>
          <Card><CardTitle>Gerir</CardTitle>
            <div className="flex flex-wrap gap-2">
              <form action={archiveProgramAction.bind(null, patientId)}><input type="hidden" name="id" value={program.id} /><input type="hidden" name="archived" value={program.archived ? '0' : '1'} />
                <Button type="submit" variant="outline">{program.archived ? <><ArchiveRestore className="h-4 w-4" /> Reativar</> : <><Archive className="h-4 w-4" /> Arquivar</>}</Button></form>
              <form action={deleteProgramAction.bind(null, patientId)}><input type="hidden" name="id" value={program.id} /><ConfirmSubmit confirmLabel="Apagar programa e registos?"><Trash2 className="h-4 w-4" /> Apagar</ConfirmSubmit></form>
            </div></Card>
        </div>
      </div>
    </>
  );
}
