'use client';

import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import type { ActionResult } from '@/lib/actions';
import type { ActivityRow } from '@/lib/activities/activities';
import { WeekdayPicker } from './plan-editor';

type Action = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any> | null>;

export function ActivityForm({ action, today, activity }: { action: Action; today: string; activity?: ActivityRow }) {
  const r = activity?.recurrence;
  return (
    <ActionForm action={action}>
      <TextField label="Nome" name="name" defaultValue={activity?.name} maxLength={60} required placeholder="Ex.: Padel, Futebol, Corrida" />
      <div className="space-y-1.5"><p className="text-sm font-medium">Dias da semana</p><WeekdayPicker defaultValue={activity?.weekdays} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Hora (opcional)" name="startTime" type="time" defaultValue={activity?.startTime ?? ''} />
        <TextField label="Duração em minutos (opcional)" name="durationMin" inputMode="numeric" defaultValue={activity?.durationMin ?? ''} placeholder="Ex.: 90" />
      </div>
      <SelectField label="Regularidade" name="pattern" defaultValue={r ? (r.kind === 'monthly' ? `m${r.weekOfMonth}` : `w${r.every}`) : 'w1'}>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Começa na semana de" name="anchor" type="date" defaultValue={r?.anchor ?? today} required />
        <TextField label="Termina em (opcional)" name="endsOn" type="date" defaultValue={r?.endsOn ?? ''} />
      </div>
      <TextAreaField label="Notas (opcional)" name="notes" defaultValue={activity?.notes ?? ''} maxLength={300} rows={2} />
      <SubmitButton pendingLabel="A guardar…">{activity ? 'Guardar alterações' : 'Criar atividade'}</SubmitButton>
    </ActionForm>
  );
}
