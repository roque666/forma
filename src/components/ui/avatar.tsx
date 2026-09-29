import { cn } from './cn';

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-accent/30 font-bold text-accent-text', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}
