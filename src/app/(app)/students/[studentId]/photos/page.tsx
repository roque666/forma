import { notFound, redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { getStudentProfile } from '@/lib/data/coach';
import { listPhotos } from '@/lib/photos/photos';
import { uuid } from '@/lib/validation/common';
import { PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PhotoGallery } from '@/components/photos/photo-gallery';

export const metadata = { title: 'Fotos do atleta' };

/** O coach só vê as fotos que o atleta partilhou (a RLS garante-o; sem vínculo ativo não há nada). */
export default async function StudentPhotosPage({ params }: { params: Promise<{ studentId: string }> }) {
  const user = await requireUser();
  if (user.role !== 'coach') redirect('/dashboard');
  const { studentId } = await params;
  if (!uuid.safeParse(studentId).success) notFound();
  const d = await withUser(user.id, async (db) => ({ student: await getStudentProfile(db, studentId), photos: await listPhotos(db, studentId) }));
  if (!d.student) notFound();
  return (
    <>
      <PageHeader title={`Fotos · ${d.student.fullName}`} back={{ href: `/students/${studentId}`, label: d.student.fullName }} subtitle="Só aparecem as fotos que o atleta decidiu partilhar" />
      {d.photos.length === 0
        ? <EmptyState icon={<Lock className="h-6 w-6" />} title="Sem fotos partilhadas" description="O atleta ainda não partilhou nenhuma foto contigo." />
        : <PhotoGallery photos={d.photos} hrefFor={(p) => `/api/progress-photo/${p.id}`} />}
    </>
  );
}
