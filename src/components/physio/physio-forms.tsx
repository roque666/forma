'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { addProgramItemAction, createProgramAction, invitePatientAction, logRehabAction, updateProgramAction, updateProgramItemAction } from '@/lib/actions/physio';
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ExercisePicker, type PickerExercise } from '@/components/training/exercise-picker';

export function InvitePatientForm() {
  return (
    <ActionForm action={invitePatientAction} resetOnSuccess>
      <TextField label="Email do paciente" name="email" type="email" autoComplete="off" required placeholder="paciente@email.com" />
      <SubmitButton size="md" pendingLabel="A enviar…">Enviar convite</SubmitButton>
      <p className="text-xs text-muted">O paciente vê o convite em Reabilitação e só depois de aceitar é que partilha os exercícios que faz. Não vês treinos, nutrição nem peso.</p>
    </ActionForm>
  );
}

export function NewProgramForm({ patientId }: { patientId: string }) {
  return (
    <ActionForm action={createProgramAction.bind(null, patientId)}>
      <TextField label="Nome do programa" name="name" required maxLength={80} placeholder="Ex.: Joelho direito – fase 1" />
      <TextAreaField label="Notas para o paciente (opcional)" name="notes" rows={2} maxLength={1000} />
      <SubmitButton size="md" pendingLabel="A criar…">Criar programa</SubmitButton>
    </ActionForm>
  );
}

export function ProgramEditForm({ patientId, programId, name, notes }: { patientId: string; programId: string; name: string; notes: string | null }) {
  return (
    <ActionForm action={updateProgramAction.bind(null, patientId, programId)}>
      <TextField label="Nome" name="name" defaultValue={name} required maxLength={80} />
      <TextAreaField label="Notas para o paciente" name="notes" rows={2} maxLength={1000} defaultValue={notes ?? ''} />
      <SubmitButton size="md" variant="secondary">Guardar</SubmitButton>
    </ActionForm>
  );
}

export function AddRehabExerciseButton({ patientId, programId, exercises }: { patientId: string; programId: string; exercises: PickerExercise[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Adicionar exercício</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Escolher exercício">
        <ExercisePicker exercises={exercises} busy={pending} onPick={(e) => start(async () => {
          const r = await addProgramItemAction(patientId, programId, e.id);
          if (r.ok) { toast.success(`${e.name} adicionado.`); setOpen(false); } else toast.error(r.error);
        })} />
      </Modal>
    </>
  );
}

export function RehabItemForm({ patientId, item }: { patientId: string; item: { id: string; sets: number | null; reps: number | null; holdSeconds: number | null; weeklyTarget: number; notes: string | null } }) {
  return (
    <ActionForm action={updateProgramItemAction.bind(null, patientId, item.id)} className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <TextField label="Séries" name="sets" inputMode="numeric" defaultValue={item.sets ?? ''} />
        <TextField label="Reps" name="reps" inputMode="numeric" defaultValue={item.reps ?? ''} />
        <TextField label="Manter (s)" name="holdSeconds" inputMode="numeric" defaultValue={item.holdSeconds ?? ''} />
        <TextField label="Vezes/sem." name="weeklyTarget" inputMode="numeric" defaultValue={item.weeklyTarget} required />
      </div>
      <TextField label="Indicações (opcional)" name="notes" maxLength={300} defaultValue={item.notes ?? ''} placeholder="Ex.: sem dor acima de 3/10" />
      <SubmitButton size="sm" variant="secondary">Guardar</SubmitButton>
    </ActionForm>
  );
}

export function RehabLogForm({ itemId }: { itemId: string }) {
  return (
    <ActionForm action={logRehabAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <SelectField label="Dor (0–10)" name="pain" defaultValue="">
          <option value="">—</option>
          {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </SelectField>
        <TextField label="Nota (opcional)" name="note" maxLength={300} placeholder="Como correu?" />
      </div>
      <SubmitButton size="md" pendingLabel="A registar…">Marcar como feito</SubmitButton>
    </ActionForm>
  );
}
