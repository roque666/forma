'use client';

import { useState } from 'react';
import { Dumbbell, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/components/ui/cn';
import { youtubeId } from '@/lib/media';

/** Foto do exercício; com 2 imagens alterna entre posição inicial e final. Sem imagens mostra um ícone. */
export function ExercisePhoto({ images, alt, className, rounded = 'rounded-xl' }: { images?: string[] | null; alt: string; className?: string; rounded?: string }) {
  const list = images ?? [];
  if (list.length === 0) {
    return <div className={cn('flex items-center justify-center bg-surface2 text-muted', rounded, className)} aria-hidden><Dumbbell className="h-1/3 w-1/3" /></div>;
  }
  return (
    <div className={cn('relative overflow-hidden bg-surface2', rounded, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={list[0]} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      {list[1] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={list[1]} alt="" aria-hidden loading="lazy" decoding="async" className="ex-swap absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

/** Vídeo: YouTube embutido (modo sem cookies); outros links abrem noutro separador. */
export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const id = youtubeId(url);
  if (!id) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
        <ExternalLink className="h-4 w-4" /> Ver vídeo
      </a>
    );
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-surface2">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`} title={`Vídeo: ${title}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0"
      />
    </div>
  );
}

/** Miniatura que abre a imagem em grande (e o vídeo, se existir). Não usar dentro de links/summary. */
export function ExerciseThumb({ name, images, videoUrl, className }: { name: string; images?: string[] | null; videoUrl?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!(images && images.length) && !videoUrl) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Ver como fazer: ${name}`} className={cn('shrink-0 overflow-hidden rounded-xl ring-1 ring-line', className ?? 'h-12 w-12')}>
        <ExercisePhoto images={images} alt="" className="h-full w-full" rounded="rounded-none" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        <div className="space-y-4">
          {images && images.length > 0 && <ExercisePhoto images={images} alt={name} className="aspect-[4/3] w-full" rounded="rounded-2xl" />}
          {images && images.length > 1 && <p className="text-center text-xs text-muted">A imagem alterna entre a posição inicial e a final.</p>}
          {videoUrl && <VideoEmbed url={videoUrl} title={name} />}
        </div>
      </Modal>
    </>
  );
}
