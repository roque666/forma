'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Diálogo nativo (<dialog>): foco, Esc e acessibilidade grátis. No mobile abre como folha inferior. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-0 text-fg shadow-2xl sm:m-auto sm:rounded-3xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-surface2">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-5">{open ? children : null}</div>
    </dialog>
  );
}
