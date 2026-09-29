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
