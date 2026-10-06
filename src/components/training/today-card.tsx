import { ClipboardList } from 'lucide-react';
import type { PlanDetail } from '@/lib/data/plans';
import type { TodayResult } from '@/lib/training/calendar';
import { formatDatePt, isoWeekday, weekdayShort } from '@/lib/dates';
import { Badge } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { StartWorkoutButton } from './start-button';
import { toggleActivityDoneAction } from '@/lib/actions/activities';

export interface TodayActivity { id: string; name: string; startTime: string | null; durationMin: number | null; done: boolean }

/** "Treino de hoje": um bloco por plano em vigor hoje (pode haver mais do que um) e o próximo treino. */
export function TodayBody({ result, plans, activities = [], today }: { result: TodayResult; plans: PlanDetail[]; activities?: TodayActivity[]; today?: string }) {
  const exCount = (planId: string, dayId: string) => plans.find((p) => p.id === planId)?.days.find((d) => d.id === dayId)?.exercises.length ?? 0;
  const { entries, next } = result;
  return (
    <div>
      {!result.hasPlans && activities.length === 0 ? (
        <div className="space-y-3"><div className="flex items-center gap-3 text-muted"><ClipboardList className="h-8 w-8" /><p className="text-sm">Ainda não tens plano ativo.</p></div>
          <div className="flex gap-2"><LinkButton href="/workouts/new" size="md">Criar plano</LinkButton><StartWorkoutButton label="Treino livre" variant="outline" size="md" /></div></div>
      ) : !result.hasPlans ? null : entries.length > 0 ? (
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
      {activities.length > 0 && (
        <ul className={entries.length > 0 || !result.hasPlans ? 'mt-3 space-y-2 border-t border-line pt-3' : 'mt-3 space-y-2 border-t border-line pt-3'}>
          {activities.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Atividade de hoje</p><p className="truncate font-semibold">{a.name}<span className="font-normal text-muted">{a.startTime ? ` · ${a.startTime}` : ''}{a.durationMin ? ` · ${a.durationMin} min` : ''}</span></p></div>
              <form action={toggleActivityDoneAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="date" value={today} /><button className={a.done ? 'rounded-xl border border-ok bg-ok/10 px-3 py-2 text-sm font-semibold text-ok' : 'rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-surface2'} aria-label={`${a.done ? 'Desmarcar' : 'Marcar como feita'}: ${a.name}`}>{a.done ? 'Feita ✓' : 'Marcar feita'}</button></form>
            </li>
          ))}
        </ul>
      )}
      {next && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">Próximo treino: <strong className="text-fg">{next.day.name}</strong>{next.plan && plans.length > 1 ? ` (${next.plan.name})` : ''}{next.date && ` · ${weekdayShort(isoWeekday(next.date))} ${formatDatePt(next.date)}`}</p>}
    </div>
  );
}
