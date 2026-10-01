import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listPhotos, ANGLE_LABELS } from '@/lib/photos/photos';
import { formatDatePt } from '@/lib/dates';
import { uuid } from '@/lib/validation/common';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState, Stat } from '@/components/ui/feedback';
import { CompareSlider } from '@/components/photos/compare-slider';
import { fmtNum } from '@/lib/labels';

export const metadata = { title: 'Comparar fotos' };
const D = { day: 'numeric', month: 'short', year: 'numeric' } as const;

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const sp = await searchParams;
  const photos = await withUser(user.id, (db) => listPhotos(db, user.id));
  if (photos.length < 2) return (<><PageHeader title="Comparar" back={{ href: '/photos', label: 'Fotos' }} /><EmptyState title="Precisas de pelo menos 2 fotos" description="Regista mais uma foto para ver a diferença." /></>);
  // por defeito: a mais antiga e a mais recente do mesmo ângulo (o ângulo mais comum)
  const byAngle = new Map<string, typeof photos>();
  for (const p of photos) byAngle.set(p.angle, [...(byAngle.get(p.angle) ?? []), p]);
  const best = [...byAngle.values()].sort((a, b) => b.length - a.length)[0];
  const find = (v?: string) => (v && uuid.safeParse(v).success ? photos.find((p) => p.id === v) : undefined);
  const a = find(sp.a) ?? (best.length >= 2 ? best[best.length - 1] : photos[photos.length - 1]);
  const b = find(sp.b) ?? (best.length >= 2 ? best[0] : photos[0]);
  const [before, after] = a.takenOn <= b.takenOn ? [a, b] : [b, a];
  const days = Math.round((Date.parse(after.takenOn) - Date.parse(before.takenOn)) / 86_400_000);
  const dw = before.weightKg != null && after.weightKg != null ? Math.round((after.weightKg - before.weightKg) * 10) / 10 : null;
  const opt = (p: (typeof photos)[number]) => `${formatDatePt(p.takenOn, D)} · ${ANGLE_LABELS[p.angle]}`;
  return (
    <>
      <PageHeader title="Antes e depois" back={{ href: '/photos', label: 'Fotos' }} subtitle="Desliza para comparar" />
      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
          <label className="text-sm font-medium">Antes
            <select name="a" defaultValue={before.id} className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">{photos.map((p) => <option key={p.id} value={p.id}>{opt(p)}</option>)}</select></label>
          <label className="text-sm font-medium">Depois
            <select name="b" defaultValue={after.id} className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">{photos.map((p) => <option key={p.id} value={p.id}>{opt(p)}</option>)}</select></label>
          <button className="self-end rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">Comparar</button>
        </form>
      </Card>
      <CompareSlider before={`/api/progress-photo/${before.id}`} after={`/api/progress-photo/${after.id}`} beforeLabel={formatDatePt(before.takenOn, D)} afterLabel={formatDatePt(after.takenOn, D)} />
      <Card className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-4">
        <Stat label="Tempo" value={days} unit={days === 1 ? 'dia' : 'dias'} />
        <Stat label="Peso" value={dw == null ? '—' : `${dw > 0 ? '+' : ''}${fmtNum(dw, 1)}`} unit={dw == null ? undefined : 'kg'} hint={dw == null ? 'Sem peso nas duas fotos' : undefined} />
      </Card>
    </>
  );
}
