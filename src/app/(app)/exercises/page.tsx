import Link from 'next/link';
import { Dumbbell, Plus, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listExercises } from '@/lib/data/exercises';
import { MUSCLES, MUSCLE_LABELS } from '@/lib/labels';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { cn } from '@/components/ui/cn';

export const metadata = { title: 'Exercícios' };

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const muscle = sp.muscle && MUSCLES.includes(sp.muscle) ? sp.muscle : undefined;
  const scope = sp.scope === 'mine' ? 'mine' : 'all';
  const list = await withUser(user.id, (db) => listExercises(db, { q: sp.q, muscle, scope, userId: user.id, includeArchived: sp.archived === '1' }));
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, muscle, scope: scope === 'mine' ? 'mine' : undefined, ...o })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const flash = sp.created ? 'Exercício criado.' : sp.deleted ? 'Exercício apagado.' : sp.archived === '1' && !sp.q ? null : sp.archived ? 'Exercício arquivado (já tem histórico).' : null;
  return (
    <>
      <PageHeader title="Exercícios" subtitle="Biblioteca base + os teus exercícios personalizados"
        actions={<LinkButton href="/exercises/new"><Plus className="h-4 w-4" /> Novo exercício</LinkButton>} />
      {flash && <p role="status" className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>}
      <form className="mb-3 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder="Pesquisar…" className={cn(inputCls, 'pl-9')} aria-label="Pesquisar exercícios" />
        </div>
        {muscle && <input type="hidden" name="muscle" value={muscle} />}
        {scope === 'mine' && <input type="hidden" name="scope" value="mine" />}
        <button className="rounded-xl bg-surface2 px-4 text-sm font-semibold">Pesquisar</button>
      </form>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <Link href={`/exercises${qs({ scope: undefined })}`} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', scope === 'all' ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>Todos</Link>
        <Link href={`/exercises${qs({ scope: 'mine' })}`} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', scope === 'mine' ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>Os meus</Link>
        <span className="mx-1 w-px shrink-0 bg-line" />
        {MUSCLES.map((m) => (
          <Link key={m} href={`/exercises${qs({ muscle: muscle === m ? undefined : m })}`} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold', muscle === m ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>{MUSCLE_LABELS[m]}</Link>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Dumbbell className="h-8 w-8" />} title="Nenhum exercício encontrado" description="Experimenta outra pesquisa ou cria um exercício personalizado."
          action={<LinkButton href="/exercises/new" variant="outline">Criar exercício</LinkButton>} />
      ) : (
        <Card className="divide-y divide-line p-0 sm:p-0">
          {list.map((e) => (
            <Link key={e.id} href={`/exercises/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-surface2">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.name}{e.archived && <span className="ml-2 text-xs text-muted">(arquivado)</span>}</p>
                <p className="truncate text-xs text-muted">{MUSCLE_LABELS[e.primaryMuscle]}{e.secondaryMuscles.length > 0 && ` · ${e.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}`}{e.equipment && ` · ${e.equipment}`}</p>
              </div>
              {e.source !== 'system' && <Badge tone="accent">{e.ownerId === user.id ? 'Meu' : 'Coach'}</Badge>}
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
