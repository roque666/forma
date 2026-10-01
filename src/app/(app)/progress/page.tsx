import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listExercisesWithHistory, getRecentPrEvents } from '@/lib/data/sessions';
import { listStudentOverview } from '@/lib/data/coach';
import { PageHeader, LinkCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { ProgressOverview } from '@/components/training/progress-overview';

export const metadata = { title: 'Progressão' };

export default async function ProgressPage() {
  const user = await requireUser();
  if (user.role === 'coach') {
    const rows = (await withUser(user.id, (db) => listStudentOverview(db))).filter((r) => r.studentId && r.linkStatus === 'active');
    return (
      <>
        <PageHeader title="Progressão" subtitle="Escolhe um atleta para ver a evolução" />
        {rows.length === 0 ? <EmptyState title="Ainda sem atletas" description="Adiciona atletas para acompanhar a progressão." action={<Link href="/students" className="font-semibold text-accent-text">Ir para atletas</Link>} /> : (
          <div className="grid gap-3 sm:grid-cols-2">{rows.map((r) => (
            <LinkCard key={r.linkId} href={`/students/${r.studentId}?tab=progress`} className="flex items-center gap-3"><Avatar name={r.fullName ?? '?'} src={r.avatarUrl} /><span className="font-semibold">{r.fullName}</span></LinkCard>))}</div>)}
      </>
    );
  }
  const { ex, prs } = await withUser(user.id, async (db) => ({ ex: await listExercisesWithHistory(db, user.id), prs: await getRecentPrEvents(db, user.id, 8) }));
  return (
    <>
      <PageHeader title="Progressão" subtitle="Evolução por exercício e recordes pessoais" />
      <ProgressOverview exercises={ex} prs={prs} tz={user.timezone} hrefFor={(id) => `/progress/${id}`} />
    </>
  );
}
