import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getPlan } from '@/lib/services/mealplans';
import * as A from '@/lib/actions/mealplans';
import { todayInTz, isValidYmd } from '@/lib/dates';
import { MEAL_TYPE_LABELS, fmtNum } from '@/lib/labels';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ActionForm, SelectField, SubmitButton, TextField } from '@/components/ui/form';
import { WeekdayPicker } from '@/components/training/plan-editor';
import { PlanItemRow } from '@/components/nutrition/plan-item-row';
import { Macros } from '@/components/nutrition/plan-generator';

export const metadata = { title: 'Plano de alimentação' };

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) notFound();
  const plan = await withUser(user.id, (db) => getPlan(db, planId));
  if (!plan) notFound();
  const r = plan.recurrence;
  const hasTarget = plan.targetKcal != null;
  return (
    <>
      <PageHeader title={plan.name} back={{ href: '/nutrition/plans', label: 'Planos' }} subtitle={plan.isActive ? 'No calendário' : 'Fora do calendário'} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          {plan.days.map((d) => (
            <Card key={d.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{d.name}</h2>
                <Badge tone="ok"><Macros t={d} target={hasTarget ? { kcal: plan.targetKcal!, proteinG: plan.targetProteinG!, carbsG: plan.targetCarbsG!, fatG: plan.targetFatG! } : undefined} /></Badge>
              </div>
              <div className="space-y-3">
                {d.meals.map((m) => (
                  <div key={m.id}>
                    <p className="mb-1 flex justify-between text-sm font-semibold">{MEAL_TYPE_LABELS[m.mealType] ?? m.mealType}<span className="text-xs font-normal text-muted tabular-nums">{fmtNum(m.kcal, 0)} kcal</span></p>
                    {m.items.length === 0 ? <p className="text-xs text-muted">Sem alimentos.</p> : <ul className="divide-y divide-line rounded-xl border border-line">{m.items.map((i) => <PlanItemRow key={i.id} itemId={i.id} name={i.name} quantity={i.quantity} unit={i.unit} kcal={i.kcal} proteinG={i.proteinG} />)}</ul>}
                  </div>))}
              </div>
              <ActionForm action={A.setDayWeekdaysAction.bind(null, d.id)} className="mt-4 border-t border-line pt-3">
                <div className="space-y-1.5"><p className="text-sm font-medium">Dias da semana</p><WeekdayPicker defaultValue={d.weekdays} /></div>
                <SubmitButton size="md" variant="secondary">Guardar dias</SubmitButton>
              </ActionForm>
            </Card>))}
        </div>
        <aside className="space-y-4">
          <Card id="calendario">
            <CardTitle>Calendário do plano</CardTitle>
            <ActionForm action={A.setPlanScheduleAction.bind(null, plan.id)}>
              <SelectField label="Regularidade" name="pattern" defaultValue={r.kind === 'monthly' ? `m${r.weekOfMonth}` : `w${r.every}`}>
                <optgroup label="Por semanas">
                  <option value="w1">Todas as semanas</option><option value="w2">De 2 em 2 semanas</option>
                  <option value="w3">De 3 em 3 semanas</option><option value="w4">De 4 em 4 semanas</option>
                </optgroup>
                <optgroup label="Uma vez por mês">
                  <option value="m1">Na 1.ª semana do mês</option><option value="m2">Na 2.ª semana do mês</option>
                  <option value="m3">Na 3.ª semana do mês</option><option value="m4">Na 4.ª semana do mês</option>
                  <option value="m5">Na última semana do mês</option>
                </optgroup>
              </SelectField>
              <TextField label="Começa na semana de" name="anchor" type="date" defaultValue={isValidYmd(r.anchor) ? r.anchor : todayInTz(user.timezone)} required />
              <TextField label="Termina em (opcional)" name="endsOn" type="date" defaultValue={r.endsOn ?? ''} />
              <SubmitButton size="md" variant="secondary">{plan.isActive ? 'Guardar' : 'Guardar e pôr no calendário'}</SubmitButton>
            </ActionForm>
            {plan.isActive && (
              <form action={A.setPlanActiveAction} className="mt-3"><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="active" value="0" /><Button variant="outline" size="md" type="submit">Tirar do calendário</Button></form>)}
          </Card>
          <Card>
            <CardTitle>Nome</CardTitle>
            <ActionForm action={A.renamePlanAction.bind(null, plan.id)}>
              <TextField label="Nome do plano" name="name" defaultValue={plan.name} maxLength={80} required />
              <SubmitButton size="md" variant="secondary">Guardar nome</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Eliminar</CardTitle>
            <p className="mb-3 text-sm text-muted">As refeições que já adicionaste ao diário mantêm-se.</p>
            <form action={A.deletePlanAction}><input type="hidden" name="id" value={plan.id} /><ConfirmSubmit confirmLabel="Eliminar mesmo?">Eliminar plano</ConfirmSubmit></form>
          </Card>
        </aside>
      </div>
    </>
  );
}
