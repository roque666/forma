import Link from 'next/link';
import { Check, Dumbbell } from 'lucide-react';
import type { SessionDetail, SessionListItem } from '@/lib/data/sessions';
import { fmtNum, MUSCLE_LABELS } from '@/lib/labels';
import { formatDuration } from '@/lib/dates';

const time = (iso: string, tz: string) => new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));

function setText(s: SessionDetail['exercises'][number]['sets'][number], tracking: string) {
  if (tracking === 'duration') return `${s.reps ?? 0} s`;
  if (tracking === 'bodyweight_reps' && !s.weightKg) return `${s.reps ?? 0} reps`;
  return `${s.weightKg != null ? fmtNum(s.weightKg, 2) : '—'} kg × ${s.reps ?? 0}`;
}

/** Treinos já feitos num dia: resumo + exercícios e séries (peso × repetições). */
export function DaySessions({ items, details, tz }: { items: SessionListItem[]; details: SessionDetail[]; tz: string }) {
  if (items.length === 0) return null;
  const total = items.reduce((a, s) => ({ vol: a.vol + s.volumeKg, sets: a.sets + s.setsCompleted, ex: a.ex + s.exercisesCount }), { vol: 0, sets: 0, ex: 0 });
  return (
    <section aria-label="Treinos feitos" className="mt-4 border-t border-line pt-4" data-testid="day-sessions">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ok"><Check className="h-4 w-4" /> {items.length === 1 ? 'Treino feito' : `${items.length} treinos feitos`}</h3>
      <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface2 p-2"><dt className="text-[11px] uppercase text-muted">Volume</dt><dd className="font-bold tabular-nums">{fmtNum(total.vol, 0)} kg</dd></div>
        <div className="rounded-xl bg-surface2 p-2"><dt className="text-[11px] uppercase text-muted">Exercícios</dt><dd className="font-bold tabular-nums">{total.ex}</dd></div>
        <div className="rounded-xl bg-surface2 p-2"><dt className="text-[11px] uppercase text-muted">Séries</dt><dd className="font-bold tabular-nums">{total.sets}</dd></div>
      </dl>
      <ul className="space-y-3">
        {items.map((s) => {
          const d = details.find((x) => x.id === s.sessionId);
          return (
            <li key={s.sessionId} className="rounded-xl border border-line p-3" data-testid="done-session">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold">{s.dayName ?? s.planName ?? 'Treino livre'}</p>
                  <p className="text-xs text-muted">{s.planName && s.dayName ? `${s.planName} · ` : ''}{time(s.startedAt, tz)} · {formatDuration(s.durationSeconds)}</p></div>
                <p className="shrink-0 text-right text-sm font-semibold tabular-nums">{fmtNum(s.volumeKg, 0)} kg<span className="block text-xs font-normal text-muted">{s.exercisesCount} exerc. · {s.setsCompleted} séries</span></p>
              </div>
              {d && d.exercises.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm">
                  {d.exercises.map((e) => {
                    const done = e.sets.filter((x) => x.completed);
                    if (done.length === 0) return null;
                    return (
                      <li key={e.id}>
                        <p className="flex items-center gap-1.5 font-medium"><Dumbbell className="h-3.5 w-3.5 shrink-0 text-muted" />{e.exerciseName}{e.primaryMuscle && <span className="text-xs font-normal text-muted">· {MUSCLE_LABELS[e.primaryMuscle] ?? e.primaryMuscle}</span>}</p>
                        <p className="ml-5 text-xs tabular-nums text-muted">{done.map((x) => setText(x, e.trackingType)).join(' · ')}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href={`/session/${s.sessionId}`} className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">Ver treino completo</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
