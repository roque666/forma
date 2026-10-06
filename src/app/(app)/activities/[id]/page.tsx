import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getActivity } from '@/lib/activities/activities';
import { deleteActivityAction, updateActivityAction } from '@/lib/actions/activities';
import { todayInTz } from '@/lib/dates';
import { uuid } from '@/lib/validation/common';
import { Card, PageHeader } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { ActivityForm } from '@/components/training/activity-form';

export const metadata = { title: 'Atividade' };

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const a = await withUser(user.id, (db) => getActivity(db, id));
  if (!a) notFound();
  return (
    <>
      <PageHeader title={a.name} back={{ href: '/activities', label: 'Atividades' }}
        actions={<form action={deleteActivityAction}><input type="hidden" name="id" value={a.id} /><ConfirmSubmit confirmLabel="Apagar atividade?">Apagar</ConfirmSubmit></form>} />
      <Card className="max-w-xl"><ActivityForm action={updateActivityAction.bind(null, a.id)} today={todayInTz(user.timezone)} activity={a} /></Card>
    </>
  );
}
