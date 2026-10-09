'use client';

import { useTransition } from 'react';
import { Check, Plus } from 'lucide-react';
import { applyPlanDayAction, unapplyPlanDayAction } from '@/lib/actions/mealplans';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export function ApplyDayButton({ dayId, date, applied, label }: { dayId: string; date: string; applied: boolean; label: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = applied ? await unapplyPlanDayAction({ dayId, date }) : await applyPlanDayAction({ dayId, date });
    if (r.ok) toast.success(r.message ?? 'Feito.'); else toast.error(r.error);
  });
  return applied
    ? <Button variant="outline" size="md" disabled={pending} onClick={run} aria-label={`Remover do diário: ${label}`}><Check className="h-4 w-4 text-ok" />{pending ? 'A remover…' : 'No diário · remover'}</Button>
    : <Button size="md" disabled={pending} onClick={run} aria-label={`Adicionar ao diário: ${label}`}><Plus className="h-4 w-4" />{pending ? 'A adicionar…' : 'Adicionar ao diário'}</Button>;
}
