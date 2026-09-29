import type { ReactNode } from 'react';

const colors = { accent: 'rgb(var(--accent))', ok: 'rgb(var(--ok))', warn: 'rgb(var(--warn))', danger: 'rgb(var(--danger))' } as const;

/** Anel de progresso (calorias). Passar do objetivo muda a cor, sem alarmismo. */
export function Ring({ value, max, size = 168, stroke = 14, tone = 'accent', children }: { value: number; max: number; size?: number; stroke?: number; tone?: keyof typeof colors; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value)} de ${Math.round(max)}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface2))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[tone]} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
