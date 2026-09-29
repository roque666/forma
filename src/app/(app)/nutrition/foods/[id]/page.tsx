import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getFood } from '@/lib/services/nutrition';
import { deleteFoodAction, updateFoodAction } from '@/lib/actions/nutrition';
import { uuid } from '@/lib/validation/common';
import { Card, PageHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { FoodForm } from '@/components/nutrition/food-form';

export const metadata = { title: 'Alimento' };

export default async function FoodPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const food = await withUser(user.id, (db) => getFood(db, id));
  if (!food) notFound();
  const mine = food.ownerId === user.id;
  return (
    <>
      <PageHeader title={food.name} back={{ href: '/nutrition/foods', label: 'Alimentos' }} />
      <Card className="max-w-2xl space-y-4">
        {!mine && <Alert>Alimento da base partilhada — não pode ser editado. Cria um alimento próprio se precisares de outros valores.</Alert>}
        <FoodForm action={updateFoodAction.bind(null, food.id)} food={food} readOnly={!mine} />
        {mine && <form action={deleteFoodAction}><input type="hidden" name="id" value={food.id} /><ConfirmSubmit>Apagar alimento</ConfirmSubmit><p className="mt-2 text-xs text-muted">Os registos já feitos no diário mantêm os valores.</p></form>}
      </Card>
    </>
  );
}
