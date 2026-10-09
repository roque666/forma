'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { removePlanItemAction, updatePlanItemAction } from '@/lib/actions/mealplans';
import { Button } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { fmtNum } from '@/lib/labels';

export function PlanItemRow({ itemId, name, quantity, unit, kcal, proteinG }: { itemId: string; name: string; quantity: number; unit: string; kcal: number; proteinG: number }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(quantity));
  const [pending, start] = useTransition();
  const label = unit === 'unit' ? 'un.' : unit;
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {editing ? (
        <span className="inline-flex items-center gap-1">
          <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Nova quantidade de ${name}`} className={cn(inputCls, 'h-9 w-20 px-2 py-1 text-center')} />
          <span className="text-xs text-muted">{label}</span>
          <Button size="sm" disabled={pending} aria-label="Guardar quantidade" onClick={() => start(async () => { const r = await updatePlanItemAction({ itemId, quantity: v }); if (r.ok) setEditing(false); else toast.error(r.error); })}><Check className="h-4 w-4" /></Button>
        </span>
      ) : (
        <>
          <button onClick={() => setEditing(true)} aria-label={`Alterar quantidade de ${name}`} className="inline-flex items-center gap-1 rounded-md px-1 text-xs tabular-nums text-muted hover:bg-surface2">{fmtNum(quantity, 1)} {label} · {fmtNum(kcal, 0)} kcal · P {fmtNum(proteinG, 0)} <Pencil className="h-3 w-3" /></button>
          <button disabled={pending} onClick={() => start(async () => { const r = await removePlanItemAction(itemId); if (!r.ok) toast.error(r.error); })} aria-label={`Remover ${name}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
        </>)}
    </li>
  );
}
