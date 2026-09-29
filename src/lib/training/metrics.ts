/** Métricas de treino (funções puras). Só contam séries concluídas e que não são de aquecimento. */

export interface SetLike {
  setType: string;
  completed: boolean;
  weightKg: number | null;
  reps: number | null;
}

/** 1RM estimado (Epley). Só fiável até ~12 repetições. */
export function epley1rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps >= 1) || reps > 12) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export const isWorkingSet = (s: SetLike) => s.completed && s.setType === 'normal' && (s.reps ?? 0) > 0;

export interface ExerciseStats {
  workingSets: number;
  totalReps: number;
  volumeKg: number;
  topWeightKg: number | null;
  bestE1rm: number | null;
  maxReps: number;
}

export function exerciseStats(sets: SetLike[]): ExerciseStats {
  let volume = 0, reps = 0, top: number | null = null, e1: number | null = null, maxReps = 0, n = 0;
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    n++;
    reps += s.reps!;
    maxReps = Math.max(maxReps, s.reps!);
    if (s.weightKg && s.weightKg > 0) {
      volume += s.weightKg * s.reps!;
      top = Math.max(top ?? 0, s.weightKg);
      const est = epley1rm(s.weightKg, s.reps!);
      if (est != null) e1 = Math.max(e1 ?? 0, est);
    }
  }
  return { workingSets: n, totalReps: reps, volumeKg: Math.round(volume * 10) / 10, topWeightKg: top, bestE1rm: e1, maxReps };
}

export interface ExerciseLike { exerciseId: string | null; exerciseName: string; sets: SetLike[] }

export function sessionTotals(exercises: ExerciseLike[]) {
  const all = exercises.map((e) => exerciseStats(e.sets));
  return {
    exercises: exercises.length,
    workingSets: all.reduce((a, s) => a + s.workingSets, 0),
    totalReps: all.reduce((a, s) => a + s.totalReps, 0),
    volumeKg: Math.round(all.reduce((a, s) => a + s.volumeKg, 0) * 10) / 10,
  };
}

export interface ComparisonRow {
  exerciseName: string;
  a: ExerciseStats | null;
  b: ExerciseStats | null;
  /** b − a (positivo = melhoria de a para b) */
  delta: { volumeKg: number | null; topWeightKg: number | null; bestE1rm: number | null; totalReps: number | null };
}

/** Compara duas sessões exercício a exercício (por id, ou por nome se o id faltar). */
export function compareSessions(a: ExerciseLike[], b: ExerciseLike[]): ComparisonRow[] {
  const key = (e: ExerciseLike) => e.exerciseId ?? `name:${e.exerciseName.toLowerCase()}`;
  const names = new Map<string, string>();
  const ma = new Map<string, ExerciseStats>();
  const mb = new Map<string, ExerciseStats>();
  for (const e of a) { names.set(key(e), e.exerciseName); ma.set(key(e), exerciseStats(e.sets)); }
  for (const e of b) { if (!names.has(key(e))) names.set(key(e), e.exerciseName); mb.set(key(e), exerciseStats(e.sets)); }
  const diff = (x?: number | null, y?: number | null) => (x == null || y == null ? null : Math.round((y - x) * 10) / 10);
  return [...names.entries()].map(([k, exerciseName]) => {
    const sa = ma.get(k) ?? null, sb = mb.get(k) ?? null;
    return {
      exerciseName, a: sa, b: sb,
      delta: {
        volumeKg: sa && sb ? diff(sa.volumeKg, sb.volumeKg) : null,
        topWeightKg: sa && sb ? diff(sa.topWeightKg, sb.topWeightKg) : null,
        bestE1rm: sa && sb ? diff(sa.bestE1rm, sb.bestE1rm) : null,
        totalReps: sa && sb ? diff(sa.totalReps, sb.totalReps) : null,
      },
    };
  });
}
