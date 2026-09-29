'use client';

import { ActionForm, NumberField, SubmitButton, TextField } from '@/components/ui/form';
import type { FoodRow } from '@/lib/services/nutrition';
import type { ActionResult } from '@/lib/actions';

type Action = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any> | null>;

export function FoodForm({ action, food, readOnly }: { action: Action; food?: FoodRow; readOnly?: boolean }) {
  const s = food?.servings[0];
  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <TextField label="Nome" name="name" defaultValue={food?.name} required maxLength={120} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Marca (opcional)" name="brand" defaultValue={food?.brand ?? ''} maxLength={80} />
          <TextField label="Categoria (opcional)" name="category" defaultValue={food?.category ?? ''} maxLength={60} />
        </div>
        <p className="text-sm font-semibold">Valores por 100 g (ou 100 ml)</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumberField label="Calorias (kcal)" name="kcal100g" defaultValue={food?.kcal100g} required />
          <NumberField label="Proteína (g)" name="protein100g" defaultValue={food?.protein100g} required />
          <NumberField label="Hidratos (g)" name="carbs100g" defaultValue={food?.carbs100g} required />
          <NumberField label="Gordura (g)" name="fat100g" defaultValue={food?.fat100g} required />
          <NumberField label="Fibra (g, opc.)" name="fiber100g" defaultValue={food?.fiber100g ?? ''} />
          <NumberField label="Densidade g/ml (líquidos)" name="densityGPerMl" defaultValue={food?.densityGPerMl ?? ''} hint="Ex.: leite 1,03" />
        </div>
        <p className="text-sm font-semibold">Porção habitual (opcional)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome da porção" name="servingLabel" defaultValue={s?.label ?? ''} placeholder="1 fatia, 1 unidade…" maxLength={40} />
          <NumberField label="Gramas da porção" name="servingGrams" defaultValue={s?.grams ?? ''} />
        </div>
      </fieldset>
      {!readOnly && <SubmitButton pendingLabel="A guardar…">{food ? 'Guardar alterações' : 'Criar alimento'}</SubmitButton>}
    </ActionForm>
  );
}
