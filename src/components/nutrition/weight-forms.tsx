'use client';

import { logWeightAction, setWeightGoalAction } from '@/lib/actions/nutrition';
import { ActionForm, NumberField, SubmitButton, TextField } from '@/components/ui/form';

export function LogWeightForm({ today, lastKg }: { today: string; lastKg?: number }) {
  return (
    <ActionForm action={logWeightAction}>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Peso (kg)" name="weightKg" placeholder={lastKg ? String(lastKg) : '75,0'} required autoFocus className="h-14 text-xl font-semibold" />
        <TextField label="Data" name="measuredOn" type="date" defaultValue={today} max={today} required />
        <NumberField label="Gordura corporal % (opc.)" name="bodyFatPct" />
        <TextField label="Nota (opc.)" name="notes" maxLength={300} />
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel="A registar…">Registar peso</SubmitButton>
      <p className="text-xs text-muted">Se já existir um registo nesse dia, é atualizado.</p>
    </ActionForm>
  );
}

export function WeightGoalForm({ studentId, defaultTarget, defaultDate }: { studentId?: string; defaultTarget?: number; defaultDate?: string | null }) {
  return (
    <ActionForm action={setWeightGoalAction} className="grid grid-cols-2 gap-3 space-y-0">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      <NumberField label="Peso objetivo (kg)" name="targetWeightKg" defaultValue={defaultTarget} required />
      <TextField label="Data alvo (opc.)" name="targetDate" type="date" defaultValue={defaultDate ?? ''} />
      <div className="col-span-2"><SubmitButton size="md" variant="secondary">Guardar objetivo de peso</SubmitButton></div>
    </ActionForm>
  );
}
