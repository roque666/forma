import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { searchFoods } from '@/lib/services/nutrition';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import { cn } from '@/components/ui/cn';
import { fmtNum } from '@/lib/labels';

export const metadata = { title: 'Alimentos' };

export default async function FoodsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = sp.scope === 'all' ? 'all' : 'mine';
  const foods = await withUser(user.id, (db) => searchFoods(db, sp.q ?? '', { scope, userId: user.id }));
  const flash = sp.created ? 'Alimento criado.' : sp.deleted ? 'Alimento apagado.' : null;
  return (
    <>
      <PageHeader title="Alimentos" back={{ href: '/nutrition', label: 'Nutrição' }} subtitle="Base inicial + os teus alimentos" actions={<LinkButton href="/nutrition/foods/new"><Plus className="h-4 w-4" /> Novo alimento</LinkButton>} />
      {flash && <p role="status" className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>}
      <form role="search" className="mb-3 flex gap-2">
        {scope === 'all' && <input type="hidden" name="scope" value="all" />}
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><input name="q" defaultValue={sp.q} placeholder="Pesquisar…" className={cn(inputCls, 'pl-9')} aria-label="Pesquisar alimentos" /></div>
        <button className="rounded-xl bg-surface2 px-4 text-sm font-semibold">Pesquisar</button>
      </form>
      <div className="mb-4 flex gap-1.5">
        <Link href="/nutrition/foods" className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', scope === 'mine' ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>Os meus</Link>
        <Link href="/nutrition/foods?scope=all" className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', scope === 'all' ? 'bg-accent text-accent-fg' : 'bg-surface2 text-muted')}>Todos</Link>
      </div>
      {foods.length === 0 ? <EmptyState title={scope === 'mine' ? 'Ainda não criaste alimentos' : 'Nenhum alimento encontrado'} description="Cria alimentos próprios (por exemplo, produtos com rótulo) para os usares no diário." action={<LinkButton href="/nutrition/foods/new" variant="outline">Criar alimento</LinkButton>} />
        : <Card className="divide-y divide-line p-0 sm:p-0">{foods.map((f) => (
          <Link key={f.id} href={`/nutrition/foods/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface2">
            <div className="min-w-0"><p className="truncate font-medium">{f.name}{f.brand && <span className="text-muted"> · {f.brand}</span>}</p><p className="text-xs text-muted">{fmtNum(f.kcal100g, 0)} kcal · P {fmtNum(f.protein100g, 0)} · H {fmtNum(f.carbs100g, 0)} · G {fmtNum(f.fat100g, 0)} /100 g</p></div>
            {f.ownerId && <Badge tone="accent">{f.source === 'coach' ? 'Coach' : 'Meu'}</Badge>}
          </Link>))}</Card>}
    </>
  );
}
