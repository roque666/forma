'use client';

import { coachCorrectMealItemAction, coachCorrectWeightAction, addNoteAction } from '@/lib/actions/coach';
import { ActionForm, NumberField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';

export function CorrectMealItemForm({ studentId, item }: { studentId: string; item: { id: string; quantity: number; kcal: number; proteinG: number; carbsG: number; fatG: number } }) {
  return (
    <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">Corrigir (fica registado)</summary>
      <ActionForm action={coachCorrectMealItemAction.bind(null, studentId)} className="mt-2 grid grid-cols-2 gap-2 space-y-0 sm:grid-cols-5">
        <input type="hidden" name="itemId" value={item.id} />
        <NumberField label="Qtd." name="quantity" defaultValue={item.quantity} /><NumberField label="kcal" name="kcal" defaultValue={item.kcal} />
        <NumberField label="Prot." name="proteinG" defaultValue={item.proteinG} /><NumberField label="Hidr." name="carbsG" defaultValue={item.carbsG} /><NumberField label="Gord." name="fatG" defaultValue={item.fatG} />
        <TextField wrapperClassName="col-span-2 sm:col-span-5" label="Motivo" name="reason" required minLength={5} maxLength={300} />
        <div className="col-span-2 sm:col-span-5"><SubmitButton size="md" variant="secondary">Registar correção</SubmitButton></div>
      </ActionForm></details>
  );
}

export function CorrectWeightForm({ studentId, entry }: { studentId: string; entry: { id: string; weightKg: number; bodyFatPct: number | null } }) {
  return (
    <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">Corrigir (fica registado)</summary>
      <ActionForm action={coachCorrectWeightAction.bind(null, studentId)} className="mt-2 grid grid-cols-2 gap-2 space-y-0">
        <input type="hidden" name="id" value={entry.id} />
        <NumberField label="Peso (kg)" name="weightKg" defaultValue={entry.weightKg} /><NumberField label="Gordura %" name="bodyFatPct" defaultValue={entry.bodyFatPct ?? ''} />
        <TextField wrapperClassName="col-span-2" label="Motivo" name="reason" required minLength={5} maxLength={300} />
        <div className="col-span-2"><SubmitButton size="md" variant="secondary">Registar correção</SubmitButton></div>
      </ActionForm></details>
  );
}

export function NoteForm({ studentId }: { studentId: string }) {
  return (
    <ActionForm action={addNoteAction.bind(null, studentId)} resetOnSuccess>
      <TextAreaField label="Nova nota privada" name="body" rows={2} maxLength={2000} placeholder="Só tu vês estas notas." />
      <SubmitButton size="md" variant="secondary">Guardar nota</SubmitButton>
    </ActionForm>
  );
}
