'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, Pencil, Star } from 'lucide-react';
import { duplicateMealAction, saveMealTemplateAction, updateItemQuantityAction, applySavedMealAction } from '@/lib/actions/nutrition';
import { ActionForm, SelectField, SubmitButton, TextField } from '@/components/ui/form';
import { inputCls } from '@/components/ui/styles';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MEAL_TYPE_LABELS, MEAL_TYPES } from '@/lib/labels';
import { cn } from '@/components/ui/cn';

export function ItemQuantity({ itemId, quantity, unit }: { itemId: string; quantity: number; unit: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(quantity));
  const [pending, start] = useTransition();
  const toast = useToast();
  const label = unit === 'unit' ? (quantity === 1 ? 'un.' : 'un.') : unit;
  if (!editing)
    return <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-md px-1 text-xs text-muted hover:bg-surface2" aria-label="Alterar quantidade">{quantity} {label} <Pencil className="h-3 w-3" /></button>;
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className={cn(inputCls, 'h-9 w-20 px-2 py-1 text-center')} aria-label="Nova quantidade" />
      <span className="text-xs text-muted">{label}</span>
      <Button size="sm" variant="primary" disabled={pending} aria-label="Guardar quantidade" onClick={() => start(async () => {
        const r = await updateItemQuantityAction({ itemId, quantity: v });
        if (r.ok) setEditing(false); else toast.error(r.error);
      })}><Check className="h-4 w-4" /></Button>
    </span>
  );
}

export function MealActions({ mealId, date, defaultName, mealType }: { mealId: string; date: string; defaultName: string; mealType: string }) {
  const [open, setOpen] = useState<null | 'dup' | 'save'>(null);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(open === 'dup' ? null : 'dup')}><Copy className="h-4 w-4" /> Duplicar</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(open === 'save' ? null : 'save')}><Star className="h-4 w-4" /> Guardar como favorita</Button>
      </div>
      {open === 'dup' && (
        <ActionForm action={duplicateMealAction} className="mt-2 grid grid-cols-2 gap-2 space-y-0" onSuccess={() => setOpen(null)}>
          <input type="hidden" name="mealId" value={mealId} />
          <TextField label="Para o dia" name="targetDate" type="date" defaultValue={date} />
          <SelectField label="Refeição" name="mealType" defaultValue={mealType}>{MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_TYPE_LABELS[m]}</option>)}</SelectField>
          <div className="col-span-2"><SubmitButton size="md" variant="secondary">Duplicar</SubmitButton></div>
        </ActionForm>
      )}
      {open === 'save' && (
        <ActionForm action={saveMealTemplateAction} className="mt-2" onSuccess={() => setOpen(null)}>
          <input type="hidden" name="mealId" value={mealId} />
          <TextField label="Nome" name="name" defaultValue={defaultName} maxLength={80} />
          <SubmitButton size="md" variant="secondary">Guardar</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function ApplySavedForm({ savedId, date, defaultType }: { savedId: string; date: string; defaultType: string | null }) {
  return (
    <ActionForm action={applySavedMealAction} className="flex flex-wrap items-end gap-2 space-y-0" toastOnSuccess>
      <input type="hidden" name="savedId" value={savedId} /><input type="hidden" name="targetDate" value={date} />
      <SelectField label="Adicionar a" name="mealType" wrapperClassName="min-w-40 flex-1" defaultValue={defaultType ?? 'lunch'}>{MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_TYPE_LABELS[m]}</option>)}</SelectField>
      <SubmitButton size="md">Adicionar</SubmitButton>
    </ActionForm>
  );
}
