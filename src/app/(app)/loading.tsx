import { Skeleton } from '@/components/ui/feedback';

export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="A carregar">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
    </div>
  );
}
