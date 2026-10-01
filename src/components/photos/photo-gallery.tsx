import Link from 'next/link';
import { Share2 } from 'lucide-react';
import { ANGLE_LABELS, type PhotoRow } from '@/lib/photos/photos';
import { formatDatePt } from '@/lib/dates';

/** Grelha de miniaturas. Com `selectable`, os cartões são links para o detalhe. */
export function PhotoGallery({ photos, hrefFor, showShared }: { photos: PhotoRow[]; hrefFor: (p: PhotoRow) => string; showShared?: boolean }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
      {photos.map((p) => (
        <li key={p.id}>
          <Link href={hrefFor(p)} className="group block overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="relative aspect-[3/4] bg-surface2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/progress-photo/${p.id}?size=thumb`} alt={`${ANGLE_LABELS[p.angle]}, ${formatDatePt(p.takenOn, { day: 'numeric', month: 'short', year: 'numeric' })}`} loading="lazy" className="h-full w-full object-cover" />
              {showShared && p.sharedWithCoach && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white" title="Partilhada com o coach"><Share2 className="h-3 w-3" /></span>}
            </div>
            <div className="px-2 py-1.5 text-xs">
              <p className="font-semibold">{formatDatePt(p.takenOn, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <p className="text-muted">{ANGLE_LABELS[p.angle]}{p.weightKg != null ? ` · ${p.weightKg} kg` : ''}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
