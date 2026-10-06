import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listActivities } from '@/lib/activities/activities';
import { createActivityAction } from '@/lib/actions/activities';
import { recurrenceLabel } from '@/lib/training/calendar';
import { todayInTz, weekdayShort } from '@/lib/dates';
import { Card, CardTitle, LinkCard, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { ActivityForm } from '@/components/training/activity-form';

export const metadata = { title: 'Atividades' };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const sp = await searchParams;
  const list = await withUser(user.id, (db) => listActivities(db, user.id));
  const flash = sp.created ? 'Atividade criada.' : sp.deleted ? 'Atividade apagada.' : null;
  return (
    <>
      <PageHeader title="Atividades" subtitle="Padel, futebol, corrida… tudo no mesmo calendário" back={{ href: '/calendar', label: 'Calendário' }} />
      {flash && <p role="status" className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Nova atividade</CardTitle>
          <ActivityForm action={createActivityAction} today={todayInTz(user.timezone)} />
        </Card>
        <div>
          <CardTitle>As minhas atividades</CardTitle>
          {list.length === 0 ? <EmptyState icon={<Trophy className="h-6 w-6" />} title="Ainda sem atividades" description="Cria a primeira ao lado, por exemplo “Padel” à quinta-feira." /> : (
            <div className="space-y-3">
              {list.map((a) => (
                <LinkCard key={a.id} href={`/activities/${a.id}`}>
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-muted">{a.weekdays.map(weekdayShort).join(' · ')}{a.startTime ? ` · ${a.startTime}` : ''}{a.durationMin ? ` · ${a.durationMin} min` : ''} · {recurrenceLabel(a.recurrence)}</p>
                </LinkCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
