import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/card';
import { WeightView } from '@/components/nutrition/weight-view';

export const metadata = { title: 'Peso' };

export default async function WeightPage() {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  return (<><PageHeader title="Peso" subtitle="Evolução, média semanal e objetivo" /><WeightView viewerId={user.id} studentId={user.id} tz={user.timezone} /></>);
}
