import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getExercise } from '@/lib/data/exercises';
import { getStudentProfile } from '@/lib/data/coach';
import { uuid } from '@/lib/validation/common';
import { PageHeader } from '@/components/ui/card';
import { ExerciseProgress } from '@/components/training/exercise-progress';
import { MUSCLE_LABELS } from '@/lib/labels';

export const metadata = { title: 'Progressão do exercício' };

export default async function ExerciseProgressPage({ params, searchParams }: { params: Promise<{ exerciseId: string }>; searchParams: Promise<{ student?: string }> }) {
  const user = await requireUser();
  const { exerciseId } = await params;
  const { student } = await searchParams;
  if (!uuid.safeParse(exerciseId).success) notFound();
  const studentId = user.role === 'coach' && student && uuid.safeParse(student).success ? student : user.id;
  const meta = await withUser(user.id, async (db) => ({ ex: await getExercise(db, exerciseId), st: studentId === user.id ? null : await getStudentProfile(db, studentId) }));
  if (!meta.ex || (studentId !== user.id && !meta.st)) notFound();
  return (
    <>
      <PageHeader title={meta.ex.name} subtitle={<>{meta.st && <strong className="text-fg">{meta.st.fullName} · </strong>}{MUSCLE_LABELS[meta.ex.primaryMuscle]}</>}
        back={studentId === user.id ? { href: '/progress', label: 'Progressão' } : { href: `/students/${studentId}?tab=progress`, label: meta.st!.fullName }} />
      <ExerciseProgress viewerId={user.id} studentId={studentId} exerciseId={exerciseId} tz={user.timezone} />
    </>
  );
}
