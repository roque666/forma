import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getSessionDetail, listSessions } from '@/lib/data/sessions';
import { compareSessions } from '@/lib/training/metrics';
import { uuid } from '@/lib/validation/common';
import { Card, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { SelectField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { fmtNum } from '@/lib/labels';
import { formatDateTimePt } from '@/lib/dates';

export const metadata = { title: 'Comparar treinos' };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const user = await requireUser();
  if (user.role !== 'student') redirect('/history');
  const sp = await searchParams;
  const ids = [sp.a, sp.b].filter((v): v is string => !!v && uuid.safeParse(v).success);
  const data = await withUser(user.id, async (db) => ({
    list: await listSessions(db, user.id, { limit: 60 }),
    a: ids[0] ? await getSessionDetail(db, ids[0]) : null,
    b: ids[1] ? await getSessionDetail(db, ids[1]) : null,
  }));
  const label = (s: (typeof data.list)[number]) => `${formatDateTimePt(s.startedAt, user.timezone)} — ${s.dayName ?? s.planName ?? 'Treino livre'}`;
  const rows = data.a && data.b ? compareSessions(data.a.exercises, data.b.exercises) : [];
  const delta = (n: number | null, unit: string) => n == null ? <span className="text-muted">—</span> : <span className={n > 0 ? 'text-ok' : n < 0 ? 'text-danger' : 'text-muted'}>{n > 0 ? '+' : ''}{fmtNum(n, 1)} {unit}</span>;
  return (
    <>
      <PageHeader title="Comparar treinos" back={{ href: '/history', label: 'Histórico' }} subtitle="A (antes) → B (depois)" />
      {data.list.length < 2 ? <EmptyState title="Precisas de pelo menos 2 treinos concluídos" /> : (
        <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <SelectField label="Treino A" name="a" defaultValue={ids[0] ?? ''}><option value="" disabled>Escolher…</option>{data.list.map((s) => <option key={s.sessionId} value={s.sessionId}>{label(s)}</option>)}</SelectField>
          <SelectField label="Treino B" name="b" defaultValue={ids[1] ?? ''}><option value="" disabled>Escolher…</option>{data.list.map((s) => <option key={s.sessionId} value={s.sessionId}>{label(s)}</option>)}</SelectField>
          <Button type="submit" size="md">Comparar</Button>
        </form>
      )}
      {ids.length === 2 && (!data.a || !data.b) && <Alert tone="error">Treino não encontrado.</Alert>}
      {rows.length > 0 && (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="px-4 py-3 font-medium">Exercício</th><th className="font-medium">Volume</th><th className="font-medium">Carga máx.</th><th className="font-medium">1RM est.</th><th className="pr-4 font-medium">Reps</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => (
              <tr key={r.exerciseName}><td className="px-4 py-3 font-medium">{r.exerciseName}{(!r.a || !r.b) && <span className="ml-2 text-xs text-muted">({r.a ? 'só em A' : 'só em B'})</span>}</td>
                <td>{delta(r.delta.volumeKg, 'kg')}</td><td>{delta(r.delta.topWeightKg, 'kg')}</td><td>{delta(r.delta.bestE1rm, 'kg')}</td><td className="pr-4">{delta(r.delta.totalReps, '')}</td></tr>))}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
