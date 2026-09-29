import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { isValidYmd, todayInTz } from '@/lib/dates';
import { PageHeader } from '@/components/ui/card';
import { NutritionStats } from '@/components/nutrition/nutrition-stats';

export const metadata = { title: 'Estatísticas de nutrição' };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ range?: string; ref?: string }> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/nutrition');
  const sp = await searchParams;
  const range = sp.range === 'month' ? 'month' : 'week';
  const ref = isValidYmd(sp.ref) ? sp.ref : todayInTz(user.timezone);
  return (
    <>
      <PageHeader title="Estatísticas" back={{ href: '/nutrition', label: 'Nutrição' }} subtitle="Médias e adesão ao objetivo" />
      <NutritionStats viewerId={user.id} studentId={user.id} tz={user.timezone} range={range} ref={ref} href={(r, d) => `/nutrition/stats?range=${r}&ref=${d}`} />
    </>
  );
}
