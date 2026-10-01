import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getExercise } from '@/lib/data/exercises';
import { getPersonalRecords } from '@/lib/data/sessions';
import { updateExerciseAction, removeExerciseAction, restoreExerciseAction } from '@/lib/actions/training';
import { ExerciseForm } from '@/components/training/exercise-form';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { ExercisePhoto, VideoEmbed } from '@/components/training/exercise-media';
import { Alert } from '@/components/ui/feedback';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { LinkButton, Button } from '@/components/ui/button';
import { uuid } from '@/lib/validation/common';

export const metadata = { title: 'Exercício' };

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ex = await withUser(user.id, (db) => getExercise(db, id));
  if (!ex) notFound();
  const mine = ex.ownerId === user.id;
  const isBase = ex.ownerId === null;
  const canEdit = mine || (isBase && user.realRole === 'coach'); // coaches podem corrigir a biblioteca base
  const hasHistory = user.role === 'student' ? (await withUser(user.id, (db) => getPersonalRecords(db, user.id, id))).length > 0 : false;
  return (
    <>
      <PageHeader title={ex.name} back={{ href: '/exercises', label: 'Exercícios' }}
        actions={user.role === 'student' && hasHistory ? <LinkButton href={`/progress/${ex.id}`} variant="outline">Ver progressão</LinkButton> : undefined} />
      {(ex.images.length > 0 || ex.mediaUrl) && (
        <Card className="mb-4 max-w-2xl space-y-3">
          {ex.images.length > 0 && <ExercisePhoto images={ex.images} alt={ex.name} className="aspect-[4/3] w-full" rounded="rounded-2xl" />}
          {ex.images.length > 1 && <p className="text-center text-xs text-muted">A imagem alterna entre a posição inicial e a final.</p>}
          {ex.mediaUrl && <VideoEmbed url={ex.mediaUrl} title={ex.name} />}
        </Card>
      )}
      <Card className="max-w-2xl space-y-4">
        {!canEdit && <Alert>Este exercício faz parte da biblioteca base e não pode ser editado. Cria um exercício próprio se precisares de uma variante.</Alert>}
        {isBase && canEdit && <Alert tone="warn">Exercício da biblioteca base: as alterações aplicam-se a todos os utilizadores.</Alert>}
        {ex.archived && <Alert tone="warn">Exercício arquivado — não aparece na pesquisa ao criar planos.</Alert>}
        <ExerciseForm action={updateExerciseAction.bind(null, ex.id)} exercise={ex} readOnly={!canEdit} />
      </Card>
      {mine && (
        <Card className="mt-4 max-w-2xl">
          <CardTitle>Zona de risco</CardTitle>
          <div className="flex flex-wrap gap-2">
            {ex.archived ? (
              <form action={restoreExerciseAction}><input type="hidden" name="id" value={ex.id} /><Button type="submit" variant="outline">Restaurar</Button></form>
            ) : (
              <form action={removeExerciseAction}>
                <input type="hidden" name="id" value={ex.id} />
                <ConfirmSubmit>Apagar exercício</ConfirmSubmit>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Se o exercício já tiver histórico, é arquivado em vez de apagado (os treinos passados mantêm-se).</p>
        </Card>
      )}
    </>
  );
}
