'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Minus, Plus, Trash2, Trophy, X, Flag } from 'lucide-react';
import { addSessionExerciseAction, addSetAction, discardSessionAction, finishSessionAction, removeSessionExerciseAction, removeSetAction, saveSetAction } from '@/lib/actions/training';
import type { SessionExerciseRow } from '@/lib/data/sessions';
import { ExerciseThumb } from './exercise-media';
import { ExercisePicker, type PickerExercise } from './exercise-picker';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { fmtNum, MUSCLE_LABELS, prValueText } from '@/lib/labels';

type Prev = Record<string, Record<number, { weightKg: number | null; reps: number | null; rir: number | null }>>;
interface Val { weight: string; reps: string; rir: string; completed: boolean; busy?: boolean; pr?: boolean }

const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));
const parseNum = (s: string): number | null => { const t = s.trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

const input = 'h-14 w-full rounded-xl border border-line bg-surface text-center text-xl font-semibold tabular-nums focus:border-accent-text focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60';

// ------------------------------------------------------------ temporizador de descanso
function useRestTimer(sessionId: string) {
  const key = `rest:${sessionId}`;
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) { const v = JSON.parse(raw); if (v.endsAt > Date.now()) { setEndsAt(v.endsAt); setTotal(v.total); } else localStorage.removeItem(key); } } catch { /* sem storage */ }
  }, [key]);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const stop = useCallback(() => { setEndsAt(null); try { localStorage.removeItem(key); } catch { /* */ } }, [key]);
  useEffect(() => {
    if (endsAt && remaining === 0) {
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
      toast.success('Descanso terminado — próxima série!');
      stop();
    }
  }, [endsAt, remaining, stop, toast]);
  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    const e = Date.now() + seconds * 1000;
    setEndsAt(e); setTotal(seconds); setNow(Date.now());
    try { localStorage.setItem(key, JSON.stringify({ endsAt: e, total: seconds })); } catch { /* */ }
  }, [key]);
  const adjust = useCallback((delta: number) => {
    setEndsAt((cur) => {
      if (!cur) return cur;
      const e = cur + delta * 1000;
      setTotal((t) => Math.max(t, Math.ceil((e - Date.now()) / 1000)));
      try { localStorage.setItem(key, JSON.stringify({ endsAt: e, total })); } catch { /* */ }
      return e;
    });
  }, [key, total]);
  return { active: !!endsAt, remaining, total, start, stop, adjust };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  return <span className="tabular-nums">{h > 0 ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : mmss(s)}</span>;
}

// ------------------------------------------------------------ componente principal
export function SessionLogger({ sessionId, startedAt, title, exercises, previous, library, mode }: {
  sessionId: string; startedAt: string; title: string; exercises: SessionExerciseRow[]; previous: Prev; library: PickerExercise[]; mode: 'active' | 'edit';
}) {
  const router = useRouter();
  const toast = useToast();
  const timer = useRestTimer(sessionId);
  const [, startNav] = useTransition();
  const initVals = useCallback((exs: SessionExerciseRow[], prev: Record<string, Val> = {}) => {
    const out = { ...prev };
    for (const e of exs) for (const s of e.sets) if (!out[s.id]) out[s.id] = { weight: numStr(s.weightKg), reps: numStr(s.reps), rir: numStr(s.rir), completed: s.completed };
    return out;
  }, []);
  const [vals, setVals] = useState<Record<string, Val>>(() => initVals(exercises));
  useEffect(() => { setVals((v) => initVals(exercises, v)); }, [exercises, initVals]);
  const [picker, setPicker] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [busyStruct, setBusyStruct] = useState(false);
  const valsRef = useRef(vals); valsRef.current = vals;

  const patch = (id: string, p: Partial<Val>) => setVals((v) => ({ ...v, [id]: { ...v[id], ...p } }));

  const stats = useMemo(() => {
    let done = 0, total = 0, volume = 0;
    for (const e of exercises) for (const s of e.sets) { total++; const v = vals[s.id]; if (v?.completed) { done++; volume += (parseNum(v.weight) || 0) * (parseNum(v.reps) || 0); } }
    return { done, total, volume };
  }, [exercises, vals]);

  async function persist(e: SessionExerciseRow, setId: string, setNumber: number, completed: boolean, startRest: boolean) {
    const cur = valsRef.current[setId];
    const s = e.sets.find((x) => x.id === setId)!;
    const prev = previous[e.exerciseId ?? '']?.[setNumber];
    const isDuration = e.trackingType === 'duration';
    // Valores por omissão: o que escreveste → planeado → última vez (1 toque repete).
    let weightStr = cur.weight, repsStr = cur.reps;
    if (completed) {
      if (weightStr.trim() === '' && !isDuration) weightStr = numStr(s.plannedWeightKg ?? prev?.weightKg);
      if (repsStr.trim() === '') repsStr = numStr(prev?.reps ?? s.plannedRepsMax ?? s.plannedRepsMin);
    }
    const weight = isDuration ? null : parseNum(weightStr); const reps = parseNum(repsStr); const rir = parseNum(cur.rir);
    if (Number.isNaN(weight) || Number.isNaN(reps) || Number.isNaN(rir)) { toast.error('Valores inválidos: usa apenas números.'); return; }
    if (completed && (reps == null || reps <= 0)) { toast.error(isDuration ? 'Indica a duração (segundos).' : 'Indica as repetições.'); return; }
    if (completed && e.trackingType === 'weight_reps' && weight == null) { toast.error('Indica o peso (0 se for sem carga).'); return; }
    patch(setId, { weight: weightStr, reps: repsStr, completed, busy: true });
    const res = await saveSetAction({ setId, weightKg: weight, reps, rir, notes: null, completed });
    if (!res.ok) { patch(setId, { completed: !completed, busy: false }); toast.error(res.error); return; }
    patch(setId, { busy: false, pr: res.data!.prs.length > 0 ? true : completed ? valsRef.current[setId]?.pr : false });
    for (const pr of res.data!.prs) toast.pr(`Novo recorde! ${pr.exerciseName} — ${prValueText(pr.prType, pr.value, pr.weightKg, pr.reps)}`);
    if (completed && startRest && mode === 'active') timer.start(e.restSeconds);
  }

  const struct = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyStruct(true);
    const r = await fn();
    setBusyStruct(false);
    if (!r.ok) toast.error(r.error ?? 'Erro');
    else startNav(() => router.refresh());
  };

  async function finish() {
    setFinishing(true);
    const r = await finishSessionAction(sessionId, notes);
    // em caso de sucesso a action faz redirect; só chegamos aqui em erro
    if (r && !r.ok) { toast.error(r.error); setFinishing(false); }
  }

  return (
    <div className="pb-44">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{title}</h1>
            <p className="flex items-center gap-2 text-sm text-muted">
              {mode === 'active' ? <><Clock className="h-4 w-4" /><Elapsed startedAt={startedAt} /></> : <Badge tone="warn">A editar treino concluído</Badge>}
              <span>· {stats.done}/{stats.total} séries</span>
              {stats.volume > 0 && <span>· {fmtNum(stats.volume, 0)} kg</span>}
            </p>
          </div>
          {mode === 'active' ? (
            <Button size="md" onClick={() => setFinishOpen(true)}><Flag className="h-4 w-4" /> Terminar</Button>
          ) : (
            <Button size="md" onClick={() => router.push(`/session/${sessionId}`)}>Concluir edição</Button>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} /></div>
      </header>

      <div className="space-y-4">
        {exercises.length === 0 && <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">Treino livre: adiciona o primeiro exercício.</p>}
        {exercises.map((e) => {
          const isDuration = e.trackingType === 'duration';
          const bw = e.trackingType === 'bodyweight_reps';
          return (
            <section key={e.id} className="rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-4" aria-label={e.exerciseName}>
              <div className="mb-3 flex items-start justify-between gap-2 px-1">
                <ExerciseThumb name={e.exerciseName} images={e.images} videoUrl={e.mediaUrl} className="h-14 w-14" />
                <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold">{e.exerciseName}</h2><p className="text-xs text-muted">{e.primaryMuscle ? MUSCLE_LABELS[e.primaryMuscle] : ''}{e.restSeconds ? ` · descanso ${e.restSeconds}s` : ''}</p></div>
                <button aria-label={`Remover ${e.exerciseName}`} disabled={busyStruct} onClick={() => struct(() => removeSessionExerciseAction(sessionId, e.id))} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className={cn('grid items-center gap-2 px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted', isDuration ? 'grid-cols-[2rem_1fr_1fr_3.5rem]' : 'grid-cols-[2rem_1fr_1fr_3rem_3.5rem]')}>
                <span>#</span>{!isDuration && <span>{bw ? '+Kg' : 'Kg'}</span>}<span>{isDuration ? 'Segundos' : 'Reps'}</span>{!isDuration && <span>RIR</span>}<span />
              </div>
              <div className="space-y-2">
                {e.sets.map((s) => {
                  const v = vals[s.id] ?? { weight: '', reps: '', rir: '', completed: false };
                  const prev = previous[e.exerciseId ?? '']?.[s.setNumber];
                  const planned = s.plannedRepsMin ? (s.plannedRepsMax && s.plannedRepsMax !== s.plannedRepsMin ? `${s.plannedRepsMin}-${s.plannedRepsMax}` : `${s.plannedRepsMin}`) : '';
                  const onBlurSave = () => { if (v.completed) persist(e, s.id, s.setNumber, true, false); };
                  return (
                    <div key={s.id} className={cn('rounded-xl p-1 transition', v.completed && 'bg-ok/10')}>
                      <div className={cn('grid items-center gap-2', isDuration ? 'grid-cols-[2rem_1fr_1fr_3.5rem]' : 'grid-cols-[2rem_1fr_1fr_3rem_3.5rem]')}>
                        <span className={cn('grid h-9 w-8 place-items-center rounded-lg text-sm font-bold', s.setType === 'warmup' ? 'bg-warn/20 text-warn' : 'bg-surface2 text-muted')}>{s.setType === 'warmup' ? 'A' : s.setNumber}</span>
                        {!isDuration && <input aria-label={`${e.exerciseName} série ${s.setNumber} peso`} inputMode="decimal" className={input} value={v.weight} placeholder={numStr(s.plannedWeightKg ?? prev?.weightKg) || '0'} onChange={(ev) => patch(s.id, { weight: ev.target.value })} onBlur={onBlurSave} />}
                        <input aria-label={`${e.exerciseName} série ${s.setNumber} ${isDuration ? 'segundos' : 'repetições'}`} inputMode="numeric" className={input} value={v.reps} placeholder={numStr(prev?.reps) || planned || '0'} onChange={(ev) => patch(s.id, { reps: ev.target.value })} onBlur={onBlurSave} />
                        {!isDuration && <input aria-label={`${e.exerciseName} série ${s.setNumber} RIR`} inputMode="decimal" className={cn(input, 'text-base')} value={v.rir} placeholder="—" onChange={(ev) => patch(s.id, { rir: ev.target.value })} onBlur={onBlurSave} />}
                        <button
                          aria-label={v.completed ? `Desmarcar série ${s.setNumber}` : `Concluir série ${s.setNumber}`} aria-pressed={v.completed} disabled={v.busy}
                          onClick={() => persist(e, s.id, s.setNumber, !v.completed, true)}
                          className={cn('grid h-14 w-14 place-items-center rounded-xl transition active:scale-90 disabled:opacity-60', v.completed ? 'bg-ok text-white' : 'bg-accent text-accent-fg')}
                        ><Check className="h-6 w-6" strokeWidth={3} /></button>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-muted">
                        <span>{prev ? `Anterior: ${prev.weightKg != null ? `${fmtNum(prev.weightKg, 2)}×` : ''}${prev.reps ?? '?'}${prev.rir != null ? ` @${prev.rir}` : ''}` : 'Sem histórico'}{planned && ` · Alvo: ${planned}`}</span>
                        <span className="flex items-center gap-2">
                          {v.pr && <Badge tone="accent"><Trophy className="h-3 w-3" /> PR</Badge>}
                          {e.sets.length > 1 && <button aria-label={`Remover série ${s.setNumber}`} disabled={busyStruct} onClick={() => struct(() => removeSetAction(s.id))} className="rounded p-1 hover:text-danger"><X className="h-3.5 w-3.5" /></button>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" className="mt-2 w-full" disabled={busyStruct} onClick={() => struct(() => addSetAction(e.id))}><Plus className="h-4 w-4" /> Adicionar série</Button>
            </section>
          );
        })}
        <Button variant="outline" size="lg" className="w-full" onClick={() => setPicker(true)}><Plus className="h-5 w-5" /> Adicionar exercício</Button>
        {mode === 'active' && (
          <div className="pt-2 text-center">
            <button onClick={() => (discardArmed ? discardSessionAction(sessionId) : (setDiscardArmed(true), setTimeout(() => setDiscardArmed(false), 3500)))} className={cn('text-sm', discardArmed ? 'font-bold text-danger' : 'text-muted underline')}>
              {discardArmed ? 'Toca outra vez para descartar este treino' : 'Descartar treino'}
            </button>
          </div>
        )}
      </div>

      {mode === 'active' && timer.active && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-2xl backdrop-blur" role="timer" aria-label="Temporizador de descanso">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Descanso</p>
              <p className="text-3xl font-bold tabular-nums leading-none">{mmss(timer.remaining)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${timer.total ? (timer.remaining / timer.total) * 100 : 0}%` }} /></div>
            </div>
            <Button variant="secondary" size="icon" aria-label="Menos 15 segundos" onClick={() => timer.adjust(-15)}><Minus className="h-5 w-5" /></Button>
            <Button variant="secondary" size="icon" aria-label="Mais 15 segundos" onClick={() => timer.adjust(15)}><Plus className="h-5 w-5" /></Button>
            <Button size="md" onClick={timer.stop}>Saltar</Button>
          </div>
        </div>
      )}

      <Modal open={picker} onClose={() => setPicker(false)} title="Adicionar exercício">
        <ExercisePicker exercises={library} busy={busyStruct} onPick={(x) => { setPicker(false); struct(() => addSessionExerciseAction(sessionId, x.id)); }} />
      </Modal>
      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title="Terminar treino?">
        <div className="space-y-4">
          <p className="text-sm text-muted">{stats.done} de {stats.total} séries concluídas. As séries por concluir ficam de fora do histórico.</p>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base focus:border-accent-text focus:outline-none focus:ring-2 focus:ring-accent/40" placeholder="Como te sentiste?" /></label>
          <Button size="lg" className="w-full" disabled={finishing} onClick={finish}>{finishing ? 'A guardar…' : 'Terminar e guardar'}</Button>
        </div>
      </Modal>
    </div>
  );
}
