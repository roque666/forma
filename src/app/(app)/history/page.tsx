import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listSessions, type SessionListItem } from '@/lib/data/sessions';
import { HistoryList } from '@/components/training/history-list';
import { PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';

export const metadata = { title: 'Histórico' };
const PAGE = 20;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const items = await withUser(user.id, (db) => user.role === 'coach'
    ? db.query<SessionListItem & { studentName: string }>(
        `select s.session_id as "sessionId", s.plan_name as "planName", s.day_name as "dayName", s.started_at as "startedAt", s.ended_at as "endedAt",
                s.duration_seconds as "durationSeconds", s.exercises_count as "exercisesCount", s.sets_completed as "setsCompleted", s.volume_kg as "volumeKg", p.full_name as "studentName"
           from public.workout_session_summaries s join public.profiles p on p.id = s.student_id
          where s.status = 'completed' and s.student_id <> $3 order by s.started_at desc limit $1 offset $2`, [PAGE + 1, (page - 1) * PAGE, user.id])
    : listSessions(db, user.id, { limit: PAGE + 1, offset: (page - 1) * PAGE }));
  const hasMore = items.length > PAGE;
  return (
    <>
      <PageHeader title="Histórico" subtitle={user.role === 'coach' ? 'Treinos recentes dos teus atletas' : 'Todos os treinos concluídos'}
        actions={user.role === 'student' ? <LinkButton href="/history/compare" variant="outline">Comparar treinos</LinkButton> : undefined} />
      <HistoryList items={items.slice(0, PAGE)} tz={user.timezone} hrefFor={(id) => `/session/${id}`} emptyAction={user.role === 'student'} />
      <div className="mt-4 flex justify-between text-sm font-medium">
        {page > 1 ? <Link href={`/history?page=${page - 1}`} className="text-accent-text">← Mais recentes</Link> : <span />}
        {hasMore && <Link href={`/history?page=${page + 1}`} className="text-accent-text">Mais antigos →</Link>}
      </div>
    </>
  );
}
