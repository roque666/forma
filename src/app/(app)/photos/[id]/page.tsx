import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getPhoto, ANGLE_LABELS } from '@/lib/photos/photos';
import { deletePhotoAction, updatePhotoAction } from '@/lib/actions/photos';
import { todayInTz } from '@/lib/dates';
import { uuid } from '@/lib/validation/common';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { PhotoForm } from '@/components/photos/photo-form';

export const metadata = { title: 'Foto de progresso' };

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const photo = await withUser(user.id, (db) => getPhoto(db, id));
  if (!photo || photo.studentId !== user.id) notFound();
  return (
    <>
      <PageHeader title={`Foto · ${ANGLE_LABELS[photo.angle]}`} back={{ href: '/photos', label: 'Fotos' }}
        actions={<form action={deletePhotoAction}><input type="hidden" name="id" value={photo.id} /><ConfirmSubmit confirmLabel="Apagar para sempre?">Apagar foto</ConfirmSubmit></form>} />
      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/progress-photo/${photo.id}`} alt={`Foto de ${photo.takenOn}`} className="mx-auto max-h-[70vh] w-full rounded-2xl border border-line object-contain bg-surface2" />
        <Card>
          <CardTitle>Detalhes</CardTitle>
          <PhotoForm action={updatePhotoAction.bind(null, photo.id)} today={todayInTz(user.timezone)} photo={photo} />
        </Card>
      </div>
    </>
  );
}
