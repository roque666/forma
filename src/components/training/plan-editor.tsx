'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { addPlanExerciseAction, savePlanSetsAction, updatePlanExerciseAction, updateDayAction, addDayAction } from '@/lib/actions/training';
import type { PlanExercise, PlanSet } from '@/lib/data/plans';
import { ExercisePicker, type PickerExercise } from './exercise-picker';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { WEEKDAYS_LONG, weekdayShort } from '@/lib/dates';

// ---------------------------------------------------------------- séries
interface SetDraft { setType: 'normal' | 'warmup'; repsMin: string; repsMax: string; weightKg: string; rir: string }
const toDraft = (s: PlanSet): SetDraft => ({
  setType: s.setType, repsMin: s.targetRepsMin?.toString() ?? '', repsMax: s.targetRepsMax?.toString() ?? '',
  weightKg: s.targetWeightKg?.toString() ?? '', rir: s.targetRir?.toString() ?? '',
});
const cell = 'h-11 w-full rounded-lg border border-line bg-surface px-2 text-center text-base tabular-nums focus:border-accent-text focus:outline-none focus:ring-2 focus:ring-accent/40';

export function SetsEditor({ planId, exercise }: { planId: string; exercise: PlanExercise }) {
  const toast = useToast();
  const [rows, setRows] = useState<SetDraft[]>(() => (exercise.sets.length ? exercise.sets.map(toDraft) : [{ setType: 'normal', repsMin: '8', repsMax: '12', weightKg: '', rir: '' }]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const set = (i: number, patch: Partial<SetDraft>) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const save = () => start(async () => {
    setError(null); setErrors({});
    const res = await savePlanSetsAction(planId, exercise.id, rows.map((r) => ({ setType: r.setType, repsMin: r.repsMin, repsMax: r.repsMax, weightKg: r.weightKg, rir: r.rir })));
    if (res.ok) { toast.success('Séries guardadas.'); setDirty(false); }
    else { setError(res.error); setErrors(res.fieldErrors ?? {}); }
  });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_2.5rem] items-center gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span>#</span><span>Reps mín</span><span>Reps máx</span><span>Kg</span><span>RIR</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_2.5rem] items-center gap-1.5">
          <button type="button" onClick={() => set(i, { setType: r.setType === 'normal' ? 'warmup' : 'normal' })} title="Alternar aquecimento"
            className={cn('h-11 rounded-lg text-xs font-bold', r.setType === 'warmup' ? 'bg-warn/20 text-warn' : 'bg-surface2 text-muted')}>{r.setType === 'warmup' ? 'A' : i + 1}</button>
          <input aria-label={`Série ${i + 1} reps mínimas`} inputMode="numeric" className={cell} value={r.repsMin} onChange={(e) => set(i, { repsMin: e.target.value })} />
          <input aria-label={`Série ${i + 1} reps máximas`} inputMode="numeric" className={cell} value={r.repsMax} onChange={(e) => set(i, { repsMax: e.target.value })} />
          <input aria-label={`Série ${i + 1} peso`} inputMode="decimal" className={cell} value={r.weightKg} placeholder="—" onChange={(e) => set(i, { weightKg: e.target.value })} />
          <input aria-label={`Série ${i + 1} RIR`} inputMode="decimal" className={cell} value={r.rir} placeholder="—" onChange={(e) => set(i, { rir: e.target.value })} />
          <button type="button" aria-label="Remover série" disabled={rows.length === 1} onClick={() => { setRows((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="grid h-11 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"><X className="h-4 w-4" /></button>
        </div>
      ))}
      {Object.keys(errors).length > 0 && <p role="alert" className="text-xs font-medium text-danger">{Object.values(errors)[0]}</p>}
      {error && Object.keys(errors).length === 0 && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={() => { setRows((x) => [...x, { ...(x[x.length - 1] ?? { setType: 'normal', repsMin: '', repsMax: '', weightKg: '', rir: '' }), setType: 'normal' }]); setDirty(true); }} disabled={rows.length >= 20}><Plus className="h-4 w-4" /> Série</Button>
        <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>{pending ? 'A guardar…' : dirty ? 'Guardar séries' : 'Guardado'}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- adicionar exercício
export function AddExerciseButton({ planId, dayId, exercises }: { planId: string; dayId: string; exercises: PickerExercise[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Adicionar exercício</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Escolher exercício">
        <ExercisePicker exercises={exercises} busy={pending} onPick={(e) => start(async () => {
          const r = await addPlanExerciseAction(planId, dayId, e.id);
          if (r.ok) { toast.success(`${e.name} adicionado.`); setOpen(false); } else toast.error(r.error);
        })} />
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- descanso + notas
export function ExerciseMetaForm({ planId, exercise }: { planId: string; exercise: PlanExercise }) {
  return (
    <ActionForm action={updatePlanExerciseAction.bind(null, planId, exercise.id)} className="grid grid-cols-[7rem_1fr_auto] items-end gap-2 space-y-0" toastOnSuccess>
      <TextField label="Descanso (s)" name="restSeconds" inputMode="numeric" defaultValue={exercise.restSeconds} />
      <TextField label="Notas" name="notes" defaultValue={exercise.notes ?? ''} maxLength={500} placeholder="Ex.: pausa em baixo" />
      <SubmitButton size="md" variant="secondary">Guardar</SubmitButton>
    </ActionForm>
  );
}


// ---------------------------------------------------------------- dias
export function WeekdayPicker({ defaultValue = [] }: { defaultValue?: number[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <label key={d} className="cursor-pointer" title={WEEKDAYS_LONG[d - 1]}>
          <input type="checkbox" name="weekdays" value={d} defaultChecked={defaultValue.includes(d)} className="peer sr-only" />
          <span className="grid h-10 w-12 place-items-center rounded-lg bg-surface2 text-xs font-bold text-muted transition peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{weekdayShort(d)}</span>
        </label>
      ))}
    </div>
  );
}

export function DayEditForm({ planId, day }: { planId: string; day: { id: string; name: string; weekdays: number[] } }) {
  return (
    <ActionForm action={updateDayAction.bind(null, planId, day.id)}>
      <TextField label="Nome do dia" name="name" defaultValue={day.name} maxLength={60} required />
      <div className="space-y-1.5"><p className="text-sm font-medium">Dias da semana (opcional)</p><WeekdayPicker defaultValue={day.weekdays} /><p className="text-xs text-muted">Sem dias definidos, a app sugere os treinos por rotação.</p></div>
      <SubmitButton size="md">Guardar dia</SubmitButton>
    </ActionForm>
  );
}

export function AddDayForm({ planId }: { planId: string }) {
  return (
    <ActionForm action={addDayAction.bind(null, planId)} resetOnSuccess>
      <TextField label="Novo dia" name="name" placeholder="Ex.: Treino A — Peito e tríceps" maxLength={60} required />
      <div className="space-y-1.5"><p className="text-sm font-medium">Dias da semana (opcional)</p><WeekdayPicker /></div>
      <SubmitButton size="md" pendingLabel="A adicionar…"><Plus className="h-4 w-4" /> Adicionar dia</SubmitButton>
    </ActionForm>
  );
}

export function MoveButtons({ action, id }: { action: (fd: FormData) => Promise<void>; id: string }) {
  return (
    <div className="flex">
      {(['up', 'down'] as const).map((dir) => (
        <form key={dir} action={action}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value={dir} />
          <button aria-label={dir === 'up' ? 'Mover para cima' : 'Mover para baixo'} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface2">{dir === 'up' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</button>
        </form>
      ))}
    </div>
  );
}
