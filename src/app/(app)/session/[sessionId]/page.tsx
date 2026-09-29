import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getPreviousPerformance, getSessionComments, getSessionCorrections, getSessionDetail, getSessionPrEvents } from '@/lib/data/sessions';
import { getStudentProfile } from '@/lib/data/coach';
import { listExercises } from '@/lib/data/exercises';
import { uuid } from '@/lib/validation/common';
import { SessionLogger } from '@/components/training/session-logger';
import { SessionSummary } from '@/components/training/session-summary';

export const metadata = { title: 'Treino' };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const { sessionId } = await params;
  const { edit } = await searchParams;
  if (!uuid.safeParse(sessionId).success) notFound();
  const data = await withUser(user.id, async (db) => {
    const detail = await getSessionDetail(db, sessionId);
    if (!detail) return null;
    const isOwner = detail.studentId === user.id;
    const needLogger = isOwner && (detail.status === 'in_progress' || edit === '1');
    return {
      detail,
      prs: await getSessionPrEvents(db, sessionId),
      comments: await getSessionComments(db, sessionId),
      corrections: await getSessionCorrections(db, sessionId),
      student: isOwner ? null : await getStudentProfile(db, detail.studentId),
      previous: needLogger ? await getPreviousPerformance(db, detail.studentId, sessionId, detail.exercises.map((e) => e.exerciseId).filter((x): x is string => !!x)) : {},
      library: needLogger ? await listExercises(db) : [],
    };
  });
  if (!data) notFound();
  const { detail } = data;
  const isOwner = detail.studentId === user.id;
  if (isOwner && detail.status === 'in_progress') {
    return <SessionLogger mode={"active"} sessionId={detail.id} startedAt={detail.startedAt} title={detail.dayName ?? detail.planName ?? 'Treino livre'} exercises={detail.exercises} previous={data.previous}
      library={data.library.map((e) => ({ id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, equipment: e.equipment, source: e.source }))} />;
  }
  if (isOwner && edit === '1' && detail.status === 'completed') {
    return <SessionLogger mode="edit" sessionId={detail.id} startedAt={detail.startedAt} title={detail.dayName ?? detail.planName ?? 'Treino livre'} exercises={detail.exercises} previous={data.previous}
      library={data.library.map((e) => ({ id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, equipment: e.equipment, source: e.source }))} />;
  }
  if (detail.status === 'discarded' && isOwner) redirect('/workouts');
  return (
    <SessionSummary detail={detail} prs={data.prs} comments={data.comments} corrections={data.corrections} viewer={user}
      studentName={data.student?.fullName} backHref={isOwner ? '/history' : `/students/${detail.studentId}?tab=history`} editHref={`/session/${detail.id}?edit=1`} />
  );
}
