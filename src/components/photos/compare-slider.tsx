'use client';

import { useState } from 'react';

/** Compara duas fotos: a "depois" fica por cima e o slider revela a "antes". */
export function CompareSlider({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm select-none overflow-hidden rounded-2xl border border-line bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`Depois: ${afterLabel}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`Antes: ${beforeLabel}`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Antes · {beforeLabel}</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">Depois · {afterLabel}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Deslizar entre antes e depois"
        className="mx-auto block w-full max-w-sm accent-[rgb(var(--accent))]" />
    </div>
  );
}
