import { notFound } from 'next/navigation';
import { Copy, Trash2, Archive, ArchiveRestore, CheckCircle2 } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getPlan } from '@/lib/data/plans';
import { listExercises } from '@/lib/data/exercises';
import { listActiveStudents } from '@/lib/data/coach';
import { uuid } from '@/lib/validation/common';
import * as A from '@/lib/actions/training';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import { AddDayForm, AddExerciseButton, DayEditForm, ExerciseMetaForm, MoveButtons, SetsEditor } from '@/components/training/plan-editor';
import { MUSCLE_LABELS, trackingHint } from '@/lib/labels';
import { weekdayShort } from '@/lib/dates';

export const metadata = { title: 'Plano de treino' };

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser();
  const { planId } = await params;
  if (!uuid.safeParse(planId).success) notFound();
  const { plan, exercises, students } = await withUser(user.id, async (db) => ({
    plan: await getPlan(db, planId),
    exercises: await listExercises(db),
    students: user.realRole === 'coach' ? await listActiveStudents(db) : [],
  }));
  if (!plan) notFound();
  const picker = exercises.map((e) => ({ id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, equipment: e.equipment, source: e.source }));
  const idForm = (extra?: Record<string, string>) => (
    <>
      <input type="hidden" name="id" value={plan.id} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
  return (
    <>
      <PageHeader title={plan.name} back={{ href: '/workouts', label: 'Treinos' }}
        subtitle={<span className="inline-flex flex-wrap items-center gap-1.5">
          {plan.isActive && <Badge tone="accent">Plano atual</Badge>}{plan.isTemplate && <Badge>Modelo</Badge>}{plan.archived && <Badge>Arquivado</Badge>}
          {plan.createdByCoach && !plan.isTemplate && <span>Criado por {plan.createdByName}</span>}
        </span>}
        actions={<>
          {!plan.isActive && !plan.isTemplate && !plan.archived && <form action={A.activatePlanAction}>{idForm()}<SubmitButton variant="primary" size="md"><CheckCircle2 className="h-4 w-4" /> Tornar atual</SubmitButton></form>}
          <form action={A.duplicatePlanAction}>{idForm()}<SubmitButton variant="outline" size="md"><Copy className="h-4 w-4" /> Duplicar</SubmitButton></form>
        </>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {plan.days.length === 0 && <EmptyState title="Este plano ainda não tem dias" description="Adiciona o primeiro dia (ex.: “Treino A”) e depois os exercícios." />}
          {plan.days.map((day) => (
            <Card key={day.id} id={`day-${day.id}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{day.name}</h2>
                  <p className="text-xs text-muted">{day.weekdays.length > 0 ? day.weekdays.map(weekdayShort).join(' · ') : 'Sem dia fixo'} · {day.exercises.length} exercícios</p>
                </div>
                <MoveButtons action={A.moveDayAction.bind(null, plan.id)} id={day.id} />
              </div>
              <div className="space-y-3">
                {day.exercises.map((pe) => (
                  <details key={pe.id} className="group rounded-xl border border-line bg-bg/40" open={day.exercises.length <= 3}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{pe.exerciseName}</p>
                        <p className="truncate text-xs text-muted">{MUSCLE_LABELS[pe.primaryMuscle]} · {pe.sets.length} séries{trackingHint(pe.trackingType) ? ` · ${trackingHint(pe.trackingType)}` : ''} · {pe.restSeconds}s descanso</p>
                      </div>
                      <span className="text-xs text-muted group-open:hidden">Editar</span>
                    </summary>
                    <div className="space-y-4 border-t border-line px-3 py-3">
                      <SetsEditor planId={plan.id} exercise={pe} />
                      <ExerciseMetaForm planId={plan.id} exercise={pe} />
                      <div className="flex items-center justify-between">
                        <MoveButtons action={A.movePlanExerciseAction.bind(null, plan.id)} id={pe.id} />
                        <form action={A.removePlanExerciseAction.bind(null, plan.id)}><input type="hidden" name="id" value={pe.id} /><ConfirmSubmit confirmLabel="Remover?"><Trash2 className="h-4 w-4" /> Remover</ConfirmSubmit></form>
                      </div>
                    </div>
                  </details>
                ))}
                <AddExerciseButton planId={plan.id} dayId={day.id} exercises={picker} />
              </div>
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium text-muted">Editar dia</summary>
                <div className="mt-3 space-y-3">
                  <DayEditForm planId={plan.id} day={day} />
                  <form action={A.deleteDayAction.bind(null, plan.id)}><input type="hidden" name="id" value={day.id} /><ConfirmSubmit confirmLabel="Apagar dia e exercícios?"><Trash2 className="h-4 w-4" /> Apagar dia</ConfirmSubmit></form>
                </div>
              </details>
            </Card>
          ))}
          <Card><CardTitle>Adicionar dia</CardTitle><AddDayForm planId={plan.id} /></Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>Detalhes</CardTitle>
            <ActionForm action={A.updatePlanAction.bind(null, plan.id)}>
              <TextField label="Nome" name="name" defaultValue={plan.name} maxLength={80} required />
              <TextAreaField label="Descrição" name="description" defaultValue={plan.description ?? ''} maxLength={500} />
              <SubmitButton size="md" variant="secondary">Guardar</SubmitButton>
            </ActionForm>
          </Card>
          {plan.isTemplate && user.role === 'coach' && (
            <Card>
              <CardTitle>Atribuir a atleta</CardTitle>
              {students.length === 0 ? <p className="text-sm text-muted">Ainda não tens atletas ativos.</p> : (
                <ActionForm action={A.assignTemplateAction}>
                  <input type="hidden" name="templateId" value={plan.id} />
                  <SelectField label="Atleta" name="studentId" defaultValue="" required>
                    <option value="" disabled>Escolher…</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </SelectField>
                  <SubmitButton size="md">Atribuir cópia</SubmitButton>
                  <p className="text-xs text-muted">O atleta recebe uma cópia independente; alterações futuras ao modelo não afetam planos já atribuídos.</p>
                </ActionForm>
              )}
            </Card>
          )}
          {user.realRole === 'coach' && !plan.isTemplate && plan.studentId === user.id && (
            <Card>
              <CardTitle>Partilhar este plano</CardTitle>
              <ActionForm action={A.sharePlanAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <SelectField label="Enviar para" name="studentId" defaultValue="">
                  <option value="">Guardar como modelo (sem atleta)</option>
                  {students.map((s) => <option key={s.id} value={s.id}>Atleta: {s.fullName}</option>)}
                </SelectField>
                <SubmitButton size="md">Partilhar cópia</SubmitButton>
                <p className="text-xs text-muted">É criada uma cópia independente; o teu plano não muda.</p>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardTitle>Gerir</CardTitle>
            <div className="flex flex-col gap-2">
              <form action={A.archivePlanAction}>{idForm({ archived: plan.archived ? '0' : '1' })}
                <Button type="submit" variant="outline" className="w-full">{plan.archived ? <><ArchiveRestore className="h-4 w-4" /> Restaurar</> : <><Archive className="h-4 w-4" /> Arquivar</>}</Button></form>
              <form action={A.deletePlanAction}>{idForm()}<ConfirmSubmit size="md" className="w-full" confirmLabel="Apagar mesmo? (o histórico mantém-se)"><Trash2 className="h-4 w-4" /> Apagar plano</ConfirmSubmit></form>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
