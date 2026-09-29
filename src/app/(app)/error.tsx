'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-8 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-warn" />
      <h1 className="text-xl font-bold">Algo correu mal</h1>
      <p className="mt-1 text-sm text-muted">Não conseguimos carregar esta página. Os teus dados estão seguros — tenta novamente.</p>
      <Button className="mt-5" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
