import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, GitCompare, Lock } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listPhotos } from '@/lib/photos/photos';
import { addPhotoAction, shareAllPhotosAction } from '@/lib/actions/photos';
import { todayInTz } from '@/lib/dates';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { LinkButton } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { PhotoForm } from '@/components/photos/photo-form';
import { PhotoGallery } from '@/components/photos/photo-gallery';

export const metadata = { title: 'Fotos de progresso' };

export default async function PhotosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role === 'coach') redirect('/students');
  const sp = await searchParams;
  const photos = await withUser(user.id, (db) => listPhotos(db, user.id));
  const flash = sp.added ? 'Foto guardada.' : sp.deleted ? 'Foto apagada.' : sp.shared === '1' ? 'Todas as fotos estão partilhadas com o teu coach.' : sp.shared === '0' ? 'Deixaste de partilhar fotos com o teu coach.' : null;
  const anyShared = photos.some((p) => p.sharedWithCoach);
  return (
    <>
      <PageHeader title="Fotos de progresso" subtitle="Regista o corpo ao longo do tempo e vê a transformação"
        actions={photos.length >= 2 ? <LinkButton href="/photos/compare" variant="outline"><GitCompare className="h-4 w-4" /> Comparar</LinkButton> : undefined} />
      {flash && <p role="status" className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>}
      <Alert tone="info" className="mb-4"><span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4 shrink-0" /> As fotos são privadas: só tu as vês, a não ser que as partilhes com o teu coach.</span></Alert>
      <div className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card id="nova">
          <CardTitle>Nova foto</CardTitle>
          <PhotoForm key={`${photos.length}`} action={addPhotoAction} today={todayInTz(user.timezone)} />
        </Card>
        <Card>
          <CardTitle action={photos.length > 0 ? <form action={shareAllPhotosAction}><input type="hidden" name="shared" value={anyShared ? '0' : '1'} /><ConfirmSubmit variant="ghost" confirmLabel={anyShared ? 'Deixar de partilhar tudo?' : 'Partilhar tudo com o coach?'}>{anyShared ? 'Deixar de partilhar' : 'Partilhar tudo com o coach'}</ConfirmSubmit></form> : undefined}>A tua linha do tempo</CardTitle>
          {photos.length === 0
            ? <EmptyState icon={<Camera className="h-6 w-6" />} title="Ainda sem fotos" description="Tira a primeira foto hoje. Daqui a umas semanas vais agradecer." />
            : <PhotoGallery photos={photos} hrefFor={(p) => `/photos/${p.id}`} showShared />}
        </Card>
      </div>
    </>
  );
}
