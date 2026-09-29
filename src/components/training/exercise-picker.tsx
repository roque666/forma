'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MUSCLE_LABELS, MUSCLES } from '@/lib/labels';
import { inputCls } from '@/components/ui/styles';
import { Badge } from '@/components/ui/feedback';
import { cn } from '@/components/ui/cn';

export interface PickerExercise { id: string; name: string; primaryMuscle: string; equipment: string | null; source: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pesquisa local (sem acentos) com filtro por músculo. Devolve o id escolhido. */
export function ExercisePicker({ exercises, onPick, busy }: { exercises: PickerExercise[]; onPick: (e: PickerExercise) => void; busy?: boolean }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const list = useMemo(() => {
    const n = norm(q);
    return exercises.filter((e) => (!muscle || e.primaryMuscle === muscle) && (!n || norm(e.name).includes(n))).slice(0, 60);
  }, [exercises, q, muscle]);
  const groups = useMemo(() => MUSCLES.filter((m) => exercises.some((e) => e.primaryMuscle === m)), [exercises]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar exercício…" className={cn(inputCls, 'pl-9')} aria-label="Pesquisar exercício" />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button onClick={() => setMuscle(null)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', !muscle ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>Todos</button>
        {groups.map((m) => (
          <button key={m} onClick={() => setMuscle(m === muscle ? null : m)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', muscle === m ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>
            {MUSCLE_LABELS[m]}
          </button>
        ))}
      </div>
      <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {list.map((e) => (
          <li key={e.id}>
            <button disabled={busy} onClick={() => onPick(e)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface2 active:bg-surface2 disabled:opacity-50">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="block truncate text-xs text-muted">{MUSCLE_LABELS[e.primaryMuscle]}{e.equipment ? ` · ${e.equipment}` : ''}</span>
              </span>
              {e.source !== 'system' && <Badge tone="accent">{e.source === 'coach' ? 'Coach' : 'Meu'}</Badge>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhum exercício encontrado.</li>}
      </ul>
    </div>
  );
}
