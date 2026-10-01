'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fail, formToObject, ok, parse, run, type ActionResult } from '../actions';
import { requireUser } from '../auth/session';
import { withUser } from '../db/pool';
import * as ph from '../photos/photos';
import { photoSchema } from '../validation/photos';
import { uuid } from '../validation/common';
import { sniffImageMime } from '../media';
import { todayInTz } from '../dates';

type FormState = ActionResult<any> | null;
const MAX_PHOTO = 1_400_000;
const MAX_THUMB = 190_000;

export async function addPhotoAction(_p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(photoSchema, formToObject(fd));
    if ('error' in p) return p.error;
    if (p.data.takenOn > todayInTz(user.timezone)) return fail('A data não pode ser no futuro.', { takenOn: 'A data não pode ser no futuro.' });
    const f = fd.get('image'); const t = fd.get('thumb');
    if (!(f instanceof File) || f.size === 0) return fail('Escolhe ou tira uma foto.', { image: 'Escolhe ou tira uma foto.' });
    if (f.size > MAX_PHOTO) return fail('A foto é demasiado grande. Tenta outra.', { image: 'Foto demasiado grande.' });
    const data = Buffer.from(await f.arrayBuffer());
    const mime = sniffImageMime(data);
    if (!mime) return fail('Formato não suportado. Usa JPG, PNG ou WebP.', { image: 'Formato não suportado.' });
    let thumb: Buffer;
    if (t instanceof File && t.size > 0 && t.size <= MAX_THUMB) {
      thumb = Buffer.from(await t.arrayBuffer());
      if (sniffImageMime(thumb) !== 'image/jpeg') return fail('Miniatura inválida. Tenta outra vez.');
    } else if (mime === 'image/jpeg' && data.length <= MAX_THUMB) thumb = data; // foto já pequena
    else return fail('Não foi possível preparar a foto. Tenta outra.', { image: 'Foto inválida.' });
    // o dono é sempre o utilizador da sessão (e a RLS impede outro valor)
    await withUser(user.id, (db) => ph.addPhoto(db, user.id, { ...p.data, img: { mime, data }, thumb }));
    revalidatePath('/photos');
    redirect('/photos?added=1');
  });
}

export async function updatePhotoAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const p = parse(photoSchema, formToObject(fd));
    if ('error' in p) return p.error;
    if (p.data.takenOn > todayInTz(user.timezone)) return fail('A data não pode ser no futuro.', { takenOn: 'A data não pode ser no futuro.' });
    await withUser(user.id, (db) => ph.updatePhoto(db, uuid.parse(id), p.data));
    revalidatePath('/photos');
    return ok(undefined, 'Foto atualizada.');
  });
}

export async function deletePhotoAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => ph.deletePhoto(db, uuid.parse(fd.get('id'))));
  revalidatePath('/photos');
  redirect('/photos?deleted=1');
}

/** Partilha (ou deixa de partilhar) todas as fotos com o coach. */
export async function shareAllPhotosAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (db) => ph.setAllShared(db, user.id, fd.get('shared') === '1'));
  revalidatePath('/photos');
  redirect('/photos?shared=' + (fd.get('shared') === '1' ? '1' : '0'));
}
