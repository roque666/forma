'use client';

import { useRef, useState } from 'react';
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';
import { MUSCLES, MUSCLE_LABELS, TRACKING_LABELS } from '@/lib/labels';
import type { ExerciseRow } from '@/lib/data/exercises';
import type { ActionResult } from '@/lib/actions';
import { ExercisePhoto } from './exercise-media';
import { Alert } from '@/components/ui/feedback';

const MAX_SIDE = 800;

/** Reduz a foto no telemóvel (máx. 800 px, JPEG) antes de a enviar: poupa dados e cabe no limite do servidor. */
async function shrinkImage(file: File): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'exercicio.jpg', { type: 'image/jpeg' }) : null;
  } catch {
    return file.size <= 1_000_000 ? file : null;
  }
}

type Action = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any> | null>;

export function ExerciseForm({ action, exercise, readOnly }: { action: Action; exercise?: ExerciseRow; readOnly?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const hasUpload = !!exercise?.images[0]?.startsWith('/api/exercise-image/');

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setImgError(null);
    if (!f) { setPreview(null); return; }
    if (!f.type.startsWith('image/')) { setImgError('Escolhe um ficheiro de imagem.'); e.target.value = ''; setPreview(null); return; }
    const out = await shrinkImage(f);
    if (!out) { setImgError('Não foi possível usar esta imagem. Tenta outra.'); e.target.value = ''; setPreview(null); return; }
    const dt = new DataTransfer(); dt.items.add(out);
    if (fileRef.current) fileRef.current.files = dt.files;
    setPreview(URL.createObjectURL(out));
  }

  return (
    <ActionForm action={action}>
      <fieldset disabled={readOnly} className="space-y-4">
        <TextField label="Nome" name="name" defaultValue={exercise?.name} maxLength={100} required autoComplete="off" />
        <SelectField label="Músculo principal" name="primaryMuscle" defaultValue={exercise?.primaryMuscle ?? ''} required>
          <option value="" disabled>Escolher…</option>
          {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>)}
        </SelectField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Músculos secundários</p>
          <div className="flex flex-wrap gap-2">
            {MUSCLES.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="checkbox" name="secondaryMuscles" value={m} defaultChecked={exercise?.secondaryMuscles.includes(m)} className="peer sr-only" />
                <span className="inline-block rounded-full bg-surface2 px-3 py-1.5 text-xs font-semibold text-muted transition peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{MUSCLE_LABELS[m]}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Equipamento" name="equipment" defaultValue={exercise?.equipment ?? ''} maxLength={80} placeholder="Barra, halteres, máquina…" />
          <SelectField label="Tipo de registo" name="trackingType" defaultValue={exercise?.trackingType ?? 'weight_reps'}>
            {Object.entries(TRACKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
        </div>
        <TextAreaField label="Instruções (opcional)" name="instructions" defaultValue={exercise?.instructions ?? ''} maxLength={2000} />
        <div className="space-y-2">
          <p className="text-sm font-medium">Imagem (opcional)</p>
          <div className="flex items-start gap-3">
            <ExercisePhoto images={preview ? [preview] : exercise?.images} alt={exercise ? 'Imagem atual' : 'Pré-visualização'} className="h-24 w-24 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <input ref={fileRef} type="file" name="image" accept="image/jpeg,image/png,image/webp,image/*" onChange={onPick}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-fg" />
              <p className="text-xs text-muted">Tira uma foto ou escolhe da galeria. É reduzida automaticamente.</p>
              {hasUpload && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeImage" className="h-4 w-4 accent-[rgb(var(--accent))]" /> Remover a imagem carregada</label>
              )}
            </div>
          </div>
          {imgError && <Alert tone="warn">{imgError}</Alert>}
        </div>
        <TextField label="Link de vídeo (opcional)" name="mediaUrl" type="url" inputMode="url" defaultValue={exercise?.mediaUrl ?? ''} maxLength={300} placeholder="https://youtu.be/…" hint="YouTube aparece embutido; outros links abrem noutro separador." />
      </fieldset>
      {!readOnly && <SubmitButton pendingLabel="A guardar…">{exercise ? 'Guardar alterações' : 'Criar exercício'}</SubmitButton>}
    </ActionForm>
  );
}
