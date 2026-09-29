'use client';

import { coachCorrectSetAction, commentSessionAction } from '@/lib/actions/training';
import { ActionForm, SubmitButton, TextField, TextAreaField } from '@/components/ui/form';

export function CommentForm({ sessionId }: { sessionId: string }) {
  return (
    <ActionForm action={commentSessionAction.bind(null, sessionId)} resetOnSuccess>
      <TextAreaField label="Novo comentário" name="body" maxLength={1000} rows={2} placeholder="Ex.: Boa evolução no supino!" />
      <SubmitButton size="md" variant="secondary" pendingLabel="A enviar…">Enviar comentário</SubmitButton>
    </ActionForm>
  );
}

export function CorrectSetForm({ sessionId, set }: { sessionId: string; set: { id: string; weightKg: number | null; reps: number | null; rir: number | null } }) {
  return (
    <ActionForm action={coachCorrectSetAction.bind(null, sessionId)} className="grid grid-cols-3 gap-2 space-y-0">
      <input type="hidden" name="setId" value={set.id} />
      <TextField label="Kg" name="weightKg" inputMode="decimal" defaultValue={set.weightKg ?? ''} />
      <TextField label="Reps" name="reps" inputMode="numeric" defaultValue={set.reps ?? ''} />
      <TextField label="RIR" name="rir" inputMode="decimal" defaultValue={set.rir ?? ''} />
      <TextField wrapperClassName="col-span-3" label="Motivo da correção (fica registado)" name="reason" required minLength={5} maxLength={300} />
      <div className="col-span-3"><SubmitButton size="md" variant="secondary" pendingLabel="A guardar…">Registar correção</SubmitButton></div>
    </ActionForm>
  );
}
