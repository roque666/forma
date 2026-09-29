'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';

export interface TrendPoint { label: string; [series: string]: number | string | null }
export interface SeriesDef { key: string; name: string; color?: string; dashed?: boolean }

const COLORS = ['rgb(var(--accent-text))', 'rgb(var(--protein))', 'rgb(var(--carbs))', 'rgb(var(--fat))'];

/** Gráfico simples (linha, área ou barras) com o tema da app. */
export function TrendChart({
  data, series, type = 'line', unit = '', height = 220, domain, reference,
}: { data: TrendPoint[]; series: SeriesDef[]; type?: 'line' | 'area' | 'bar'; unit?: string; height?: number; domain?: [number | 'auto', number | 'auto']; reference?: { y: number; label: string } }) {
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: -12 } };
  const axis = { stroke: 'rgb(var(--muted))', fontSize: 11, tickLine: false, axisLine: false } as const;
  const tooltip = (
    <Tooltip
      cursor={{ stroke: 'rgb(var(--line))' }}
      contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12, color: 'rgb(var(--fg))' }}
      formatter={(v: unknown, n: unknown) => [`${typeof v === 'number' ? Math.round(v * 100) / 100 : v}${unit ? ' ' + unit : ''}`, String(n)]}
    />
  );
  const grid = <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />;
  const xy = (<><XAxis dataKey="label" {...axis} minTickGap={24} /><YAxis {...axis} domain={domain ?? ['auto', 'auto']} width={44} /></>);
  const ref = reference ? <ReferenceLine y={reference.y} stroke="rgb(var(--muted))" strokeDasharray="4 4" label={{ value: reference.label, fill: 'rgb(var(--muted))', fontSize: 11, position: 'insideTopRight' }} /> : null;
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart {...common}>{grid}{xy}{tooltip}{ref}
            {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} />)}
          </BarChart>
        ) : type === 'area' ? (
          <AreaChart {...common}>{grid}{xy}{tooltip}{ref}
            {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? COLORS[i % COLORS.length]} fill={s.color ?? COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2.5} connectNulls />)}
          </AreaChart>
        ) : (
          <LineChart {...common}>{grid}{xy}{tooltip}{ref}
            {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? COLORS[i % COLORS.length]} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? '4 4' : undefined} dot={s.dashed ? false : { r: 3 }} activeDot={{ r: 5 }} connectNulls />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
