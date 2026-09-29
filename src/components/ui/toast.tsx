'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Trophy, X } from 'lucide-react';
import { cn } from './cn';

type Tone = 'success' | 'error' | 'pr';
interface ToastItem { id: number; tone: Tone; message: string }
interface ToastApi { success(m: string): void; error(m: string): void; pr(m: string): void }

const Ctx = createContext<ToastApi>({ success() {}, error() {}, pr() {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: Tone, message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, tone, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'pr' ? 5000 : 3500);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), pr: (m) => push('pr', m) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-md animate-pop items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg',
              t.tone === 'success' && 'bg-fg text-bg',
              t.tone === 'error' && 'bg-danger text-white',
              t.tone === 'pr' && 'bg-accent text-accent-fg',
            )}
          >
            {t.tone === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {t.tone === 'error' && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {t.tone === 'pr' && <Trophy className="h-5 w-5 shrink-0" />}
            <span>{t.message}</span>
            <button aria-label="Fechar" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="ml-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
