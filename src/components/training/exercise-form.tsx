'use client';

import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import { MUSCLES, MUSCLE_LABELS, TRACKING_LABELS } from '@/lib/labels';
import type { ExerciseRow } from '@/lib/data/exercises';
import type { ActionResult } from '@/lib/actions';

type Action = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any> | null>;

export function ExerciseForm({ action, exercise, readOnly }: { action: Action; exercise?: ExerciseRow; readOnly?: boolean }) {
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <TextField label="Nome" name="name" defaultValue={exercise?.name} maxLength={100} required autoComplete="off" />
        <SelectField label="Músculo principal" name="primaryMuscle" defaultValue={exercise?.primaryMuscle ?? ''} required>
          <option value="" disabled>Escolher…</option>
          {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>)}
        </SelectField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Músculos secundários</p>
          <div className="flex flex-wrap gap-2">
            {MUSCLES.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="checkbox" name="secondaryMuscles" value={m} defaultChecked={exercise?.secondaryMuscles.includes(m)} className="peer sr-only" />
                <span className="inline-block rounded-full bg-surface2 px-3 py-1.5 text-xs font-semibold text-muted transition peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{MUSCLE_LABELS[m]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Equipamento" name="equipment" defaultValue={exercise?.equipment ?? ''} maxLength={80} placeholder="Barra, halteres, máquina…" />
          <SelectField label="Tipo de registo" name="trackingType" defaultValue={exercise?.trackingType ?? 'weight_reps'}>
            {Object.entries(TRACKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
        </div>
        <TextAreaField label="Instruções (opcional)" name="instructions" defaultValue={exercise?.instructions ?? ''} maxLength={2000} />
      </fieldset>
      {!readOnly && <SubmitButton pendingLabel="A guardar…">{exercise ? 'Guardar alterações' : 'Criar exercício'}</SubmitButton>}
    </ActionForm>
  );
}
