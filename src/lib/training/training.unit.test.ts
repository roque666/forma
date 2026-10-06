import { describe, expect, it } from 'vitest';
import { compareSessions, epley1rm, exerciseStats, sessionTotals } from './metrics';
import { expectedSessionsPerWeek, resolveSchedule } from './schedule';

const set = (weightKg: number | null, reps: number | null, o: Partial<{ setType: string; completed: boolean }> = {}) =>
  ({ setType: 'normal', completed: true, weightKg, reps, ...o });

describe('metrics', () => {
  it('epley: fórmula e limites', () => {
    expect(epley1rm(100, 5)).toBe(116.7);
    expect(epley1rm(100, 13)).toBeNull();
    expect(epley1rm(0, 5)).toBeNull();
    expect(epley1rm(100, 0)).toBeNull();
  });
  it('ignora aquecimento e séries não concluídas', () => {
    const s = exerciseStats([set(20, 10, { setType: 'warmup' }), set(80, 5, { completed: false }), set(60, 8), set(70, 5)]);
    expect(s.workingSets).toBe(2);
    expect(s.volumeKg).toBe(60 * 8 + 70 * 5);
    expect(s.topWeightKg).toBe(70);
    expect(s.maxReps).toBe(8);
  });
  it('peso corporal: conta reps sem volume', () => {
    const s = exerciseStats([set(null, 12), set(0, 10)]);
    expect(s.totalReps).toBe(22);
    expect(s.volumeKg).toBe(0);
    expect(s.topWeightKg).toBeNull();
  });
  it('totais da sessão e comparação', () => {
    const a = [{ exerciseId: 'x', exerciseName: 'Supino', sets: [set(60, 10)] }];
    const b = [{ exerciseId: 'x', exerciseName: 'Supino', sets: [set(65, 10)] }, { exerciseId: 'y', exerciseName: 'Remada', sets: [set(50, 10)] }];
    expect(sessionTotals(b)).toMatchObject({ exercises: 2, workingSets: 2, volumeKg: 1150 });
    const rows = compareSessions(a, b);
    expect(rows).toHaveLength(2);
    expect(rows[0].delta.topWeightKg).toBe(5);
    expect(rows[1].a).toBeNull();
    expect(rows[1].delta.volumeKg).toBeNull();
  });
});

describe('schedule', () => {
  // 2024-01-01 é segunda-feira
  const days = [
    { id: 'a', name: 'A', position: 1, weekdays: [1, 4] },
    { id: 'b', name: 'B', position: 2, weekdays: [3] },
  ];
  it('modo calendário: hoje e próximo', () => {
    const r = resolveSchedule({ days, today: '2024-01-01' });
    expect(r.mode).toBe('weekday');
    expect(r.today?.id).toBe('a');
    expect(r.next?.day.id).toBe('b');
    expect(r.next?.date).toBe('2024-01-03');
  });
  it('dia de descanso e concluído hoje', () => {
    expect(resolveSchedule({ days, today: '2024-01-02' }).today).toBeNull();
    expect(resolveSchedule({ days, today: '2024-01-01', completedTodayDayIds: ['a'] }).doneToday).toBe(true);
  });
  it('modo rotação segue o último concluído', () => {
    const rot = [{ id: 'a', name: 'A', position: 1, weekdays: [] }, { id: 'b', name: 'B', position: 2, weekdays: [] }, { id: 'c', name: 'C', position: 3, weekdays: [] }];
    expect(resolveSchedule({ days: rot, today: '2024-01-01' }).today?.id).toBe('a');
    expect(resolveSchedule({ days: rot, today: '2024-01-01', lastCompletedDayId: 'c' }).today?.id).toBe('a');
    const r = resolveSchedule({ days: rot, today: '2024-01-01', lastCompletedDayId: 'a' });
    expect(r.today?.id).toBe('b');
    expect(r.next?.day.id).toBe('c');
  });
  it('sem dias', () => {
    expect(resolveSchedule({ days: [], today: '2024-01-01' }).mode).toBe('none');
  });
  it('sessões esperadas por semana', () => {
    expect(expectedSessionsPerWeek(days)).toBe(3);
    expect(expectedSessionsPerWeek([{ weekdays: [] }, { weekdays: [] }])).toBe(2);
  });
});

import { expectedForWeek, itemsOn, nextScheduled, planOnDate, resolveToday, recurrenceLabel, type CalPlan, type Recurrence } from './calendar';

describe('calendário de planos', () => {
  const weekly = (anchor: string | null = '2026-09-28', every = 1): Recurrence => ({ kind: 'weekly', every, weekOfMonth: null, anchor, endsOn: null });
  const ppl: CalPlan = { id: 'ppl', name: 'PPL', recurrence: weekly('2026-09-28', 2), days: [
    { id: 'push', name: 'Push', position: 0, weekdays: [1] }, { id: 'pull', name: 'Pull', position: 1, weekdays: [3] }] };
  const unc: CalPlan = { id: 'unc', name: 'UNC', recurrence: weekly('2026-10-05', 2), days: [{ id: 'u1', name: 'UNC 1', position: 0, weekdays: [1, 4] }] };

  it('de 2 em 2 semanas alterna entre planos', () => {
    expect(planOnDate(ppl.recurrence, '2026-09-28')).toBe(true);   // semana 0
    expect(planOnDate(ppl.recurrence, '2026-10-05')).toBe(false);  // semana 1
    expect(planOnDate(ppl.recurrence, '2026-10-12')).toBe(true);   // semana 2
    expect(itemsOn([ppl, unc], '2026-10-05').map((i) => i.day.id)).toEqual(['u1']);
    expect(itemsOn([ppl, unc], '2026-10-12').map((i) => i.day.id)).toEqual(['push']);
  });
  it('antes do início e depois do fim o plano não está em vigor', () => {
    expect(planOnDate(weekly('2026-10-05'), '2026-09-30')).toBe(false);
    expect(planOnDate({ ...weekly('2026-09-01'), endsOn: '2026-10-10' }, '2026-10-12')).toBe(false);
  });
  it('mensal: n-ésima semana e última semana do mês', () => {
    const m = (w: number): Recurrence => ({ kind: 'monthly', every: 1, weekOfMonth: w, anchor: '2026-01-01', endsOn: null });
    expect(planOnDate(m(1), '2026-10-01')).toBe(false); // semana de 28/09 (segunda no mês anterior, dia 28 → 4.ª)
    expect(planOnDate(m(1), '2026-10-05')).toBe(true);  // segunda-feira dia 5 → 1.ª
    expect(planOnDate(m(2), '2026-10-12')).toBe(true);
    expect(planOnDate(m(5), '2026-10-26')).toBe(true);  // última segunda-feira de outubro
    expect(planOnDate(m(5), '2026-10-19')).toBe(false);
    expect(recurrenceLabel(m(5))).toContain('última');
  });
  it('hoje junta os planos em vigor e o próximo vem do calendário', () => {
    const r = resolveToday([ppl, unc], '2026-09-28', {});
    expect(r.entries.map((e) => e.day.id)).toEqual(['push']);
    expect(r.next?.day.id).toBe('pull');
    expect(r.next?.date).toBe('2026-09-30');
    const e = resolveToday([ppl], '2026-09-29', {});
    expect(e.entries).toHaveLength(0);
    expect(e.next?.date).toBe('2026-09-30');
  });
  it('treinos previstos por semana respeitam a regularidade', () => {
    expect(expectedForWeek([ppl, unc], '2026-09-28')).toBe(2);
    expect(expectedForWeek([ppl, unc], '2026-10-05')).toBe(2);
    expect(nextScheduled([unc], '2026-10-05')?.date).toBe('2026-10-08');
  });
});

import { itemsOnActivities } from './calendar';
describe('atividades no calendário', () => {
  const padel = { id: 'p', weekdays: [4], recurrence: { kind: 'weekly' as const, every: 2, weekOfMonth: null, anchor: '2026-10-01', endsOn: null } };
  it('só aparecem no dia da semana e nas semanas do ciclo', () => {
    expect(itemsOnActivities([padel], '2026-10-01')).toHaveLength(1);  // quinta, semana 0
    expect(itemsOnActivities([padel], '2026-10-08')).toHaveLength(0);  // semana 1
    expect(itemsOnActivities([padel], '2026-10-15')).toHaveLength(1);  // semana 2
    expect(itemsOnActivities([padel], '2026-10-02')).toHaveLength(0);  // sexta
  });
});
