/** "3 × 10 · 5 s · 3×/semana" */
export function prescriptionText(i: { sets: number | null; reps: number | null; holdSeconds: number | null; weeklyTarget: number }): string {
  const parts: string[] = [];
  if (i.sets && i.reps) parts.push(`${i.sets} × ${i.reps}`);
  else if (i.sets) parts.push(`${i.sets} séries`);
  else if (i.reps) parts.push(`${i.reps} repetições`);
  if (i.holdSeconds) parts.push(`manter ${i.holdSeconds} s`);
  parts.push(`${i.weeklyTarget}×/semana`);
  return parts.join(' · ');
}
