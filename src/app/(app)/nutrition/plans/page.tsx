import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listPlans } from '@/lib/services/mealplans';
import { recurrenceLabel } from '@/lib/training/calendar';
import { LinkCard, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { fmtNum } from '@/lib/labels';

export const metadata = { title: 'Planos de alimentação' };

export default async function PlansPage() {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/nutrition');
  const plans = await withUser(user.id, (db) => listPlans(db, user.id));
  return (
    <>
      <PageHeader title="Nutrição" subtitle="Modelos de alimentação" actions={<LinkButton href="/nutrition/plans/generate"><Sparkles className="h-4 w-4" />Gerar plano</LinkButton>} />
      <NutritionTabs active="plans" />
      {plans.length === 0 ? (
        <EmptyState title="Ainda sem planos" description="Adiciona os alimentos que tens em casa e gera um plano que bate as tuas macros." action={<LinkButton href="/nutrition/pantry">Abrir despensa</LinkButton>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <LinkCard key={p.id} href={`/nutrition/plans/${p.id}`}>
              <div className="mb-1 flex items-center justify-between gap-2"><p className="truncate font-semibold">{p.name}</p>{p.isActive ? <Badge tone="ok">No calendário</Badge> : <Badge>Fora do calendário</Badge>}</div>
              <p className="text-xs text-muted">{p.days.length === 1 ? 'Dia-tipo' : `${p.days.length} dias`} · ~{fmtNum(p.days.reduce((a, d) => a + d.kcal, 0) / Math.max(1, p.days.length), 0)} kcal/dia{p.isActive ? ` · ${recurrenceLabel(p.recurrence)}` : ''}</p>
            </LinkCard>))}
        </div>)}
    </>
  );
}
