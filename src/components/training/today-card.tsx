import { ClipboardList } from 'lucide-react';
import type { PlanDetail } from '@/lib/data/plans';
import type { TodayResult } from '@/lib/training/calendar';
import { formatDatePt, isoWeekday, weekdayShort } from '@/lib/dates';
import { Badge } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from './start-button';

/** "Treino de hoje": um bloco por plano em vigor hoje (pode haver mais do que um) e o próximo treino. */
export function TodayBody({ result, plans }: { result: TodayResult; plans: PlanDetail[] }) {
  const exCount = (planId: string, dayId: string) => plans.find((p) => p.id === planId)?.days.find((d) => d.id === dayId)?.exercises.length ?? 0;
  const { entries, next } = result;
  return (
    <div>
      {!result.hasPlans ? (
        <div className="space-y-3"><div className="flex items-center gap-3 text-muted"><ClipboardList className="h-8 w-8" /><p className="text-sm">Ainda não tens plano ativo.</p></div>
          <div className="flex gap-2"><LinkButton href="/workouts/new" size="md">Criar plano</LinkButton><StartWorkoutButton label="Treino livre" variant="outline" size="md" /></div></div>
      ) : entries.length > 0 ? (
        <div className="divide-y divide-line">
          {entries.map((e) => (
            <div key={e.day.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{e.done ? 'Concluído hoje' : e.mode === 'rotation' ? 'Treino sugerido' : 'Treino de hoje'}</p>
                  <p className="truncate text-2xl font-bold">{e.day.name}</p>
                  <p className="text-sm text-muted">{e.plan.name} · {exCount(e.plan.id, e.day.id)} exercícios</p>
                </div>
                {e.done && <Badge tone="ok">Feito ✓</Badge>}
              </div>
              <StartWorkoutButton dayId={e.day.id} label={e.done ? 'Repetir treino' : 'Iniciar treino'} variant={e.done ? 'outline' : 'primary'} className="mt-3" />
            </div>
          ))}
        </div>
      ) : (
        <div><p className="text-xl font-bold">Dia de descanso</p><p className="text-sm text-muted">Recupera bem. Se quiseres, podes treinar na mesma:</p><div className="mt-3"><StartWorkoutButton label="Treino livre" variant="outline" size="md" /></div></div>
      )}
      {next && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">Próximo treino: <strong className="text-fg">{next.day.name}</strong>{next.plan && plans.length > 1 ? ` (${next.plan.name})` : ''}{next.date && ` · ${weekdayShort(isoWeekday(next.date))} ${formatDatePt(next.date)}`}</p>}
    </div>
  );
}
