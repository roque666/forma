'use client';

import { useRef, useState } from 'react';
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import { Alert } from '@/components/ui/feedback';
import { ANGLES, ANGLE_LABELS, type PhotoRow } from '@/lib/photos/photos';
import type { ActionResult } from '@/lib/actions';

type Action = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any> | null>;

async function resize(file: File, side: number, quality: number, name: string): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return blob ? new File([blob], name, { type: 'image/jpeg' }) : null;
  } catch { return null; }
}

/** Nova foto (com câmara/galeria) ou edição dos dados de uma foto existente. */
export function PhotoForm({ action, today, photo }: { action: Action; today: string; photo?: PhotoRow }) {
  // As fotos ficam em memória: o React limpa os campos de ficheiro depois de um erro de validação,
  // e assim o utilizador não tem de voltar a escolher a foto.
  const files = useRef<{ big: File; small: File } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErr(null);
    if (!f) { files.current = null; setPreview(null); return; }
    if (!f.type.startsWith('image/')) { setErr('Escolhe um ficheiro de imagem.'); e.target.value = ''; files.current = null; setPreview(null); return; }
    const big = await resize(f, 1100, 0.8, 'foto.jpg');
    const small = await resize(f, 320, 0.7, 'mini.jpg');
    if (!big || !small) { setErr('Não foi possível usar esta imagem. Tenta outra.'); e.target.value = ''; setPreview(null); return; }
    files.current = { big, small };
    setPreview(URL.createObjectURL(big));
  }

  const wrapped: Action = (prev, fd) => {
    if (files.current) { fd.set('image', files.current.big); fd.set('thumb', files.current.small); }
    return action(prev, fd);
  };

  return (
    <ActionForm action={wrapped} toastOnSuccess={!!photo}>
      {!photo && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Foto</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Pré-visualização da foto" className="max-h-80 rounded-xl border border-line object-contain" />}
          <input type="file" accept="image/*" onChange={onPick}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg" />
          <p className="text-xs text-muted">No telemóvel podes tirar a foto na hora. É reduzida automaticamente e só tu a vês.</p>
          {err && <Alert tone="warn">{err}</Alert>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Data" name="takenOn" type="date" max={today} defaultValue={photo?.takenOn ?? today} required />
        <SelectField label="Ângulo" name="angle" defaultValue={photo?.angle ?? 'front'}>
          {ANGLES.map((a) => <option key={a} value={a}>{ANGLE_LABELS[a]}</option>)}
        </SelectField>
        <TextField label="Peso (kg, opcional)" name="weightKg" inputMode="decimal" defaultValue={photo?.weightKg ?? ''} placeholder="Ex.: 78,5" />
      </div>
      <TextAreaField label="Nota (opcional)" name="note" defaultValue={photo?.note ?? ''} maxLength={300} rows={2} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="shared" defaultChecked={photo?.sharedWithCoach} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
        <span>Partilhar esta foto com o meu coach<span className="block text-xs text-muted">Por defeito as fotos são só tuas. Podes mudar isto quando quiseres.</span></span>
      </label>
      <SubmitButton pendingLabel="A guardar…">{photo ? 'Guardar alterações' : 'Guardar foto'}</SubmitButton>
    </ActionForm>
  );
}
