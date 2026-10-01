import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, computeFollowUp, sortByAttention, toLocalDate, type StudentActivity } from './followup';

const TODAY = '2026-09-29';
const base: StudentActivity = {
  linkStatus: 'active',
  lastWorkoutAt: '2026-09-28T18:00:00Z',
  lastMealDate: '2026-09-29',
  lastWeighIn: '2026-09-25',
  hasActivePlan: true,
  linkedAt: '2026-06-01T10:00:00Z',
};

describe('estado de acompanhamento', () => {
  it('em dia', () => {
    const r = computeFollowUp(base, TODAY);
    expect(r.status).toBe('on_track');
    expect(r.reasons).toEqual([]);
    expect(r.daysSince).toEqual({ workout: 1, meal: 0, weighIn: 4 });
  });
  it('convite pendente nunca gera alertas', () => {
    expect(computeFollowUp({ ...base, linkStatus: 'pending', hasActivePlan: false }, TODAY)).toMatchObject({ status: 'pending', reasons: [] });
  });
  it('alertas por limite (treino, refeições, pesagem)', () => {
    const r = computeFollowUp({ ...base, lastWorkoutAt: '2026-09-10T10:00:00Z', lastMealDate: '2026-09-24', lastWeighIn: '2026-09-01' }, TODAY);
    expect(r.status).toBe('attention');
    expect(r.reasons).toEqual(['workout_overdue', 'meals_overdue', 'weigh_in_overdue']);
  });
  it('limites configuráveis pelo coach', () => {
    const a = { ...base, lastWorkoutAt: '2026-09-20T10:00:00Z' }; // 9 dias
    expect(computeFollowUp(a, TODAY).reasons).toContain('workout_overdue');
    expect(computeFollowUp(a, TODAY, { workoutAlertDays: 10, mealAlertDays: 3, weighInAlertDays: 14, inactiveDays: 30 }).status).toBe('on_track');
  });
  it('sem plano atual', () => {
    expect(computeFollowUp({ ...base, hasActivePlan: false }, TODAY).reasons).toEqual(['no_active_plan']);
  });
  it('inativo: sem qualquer atividade há mais do que o limite', () => {
    const r = computeFollowUp({ ...base, lastWorkoutAt: '2026-09-01T10:00:00Z', lastMealDate: '2026-09-02', lastWeighIn: '2026-08-20' }, TODAY);
    expect(r.status).toBe('inactive');
  });
  it('atleta novo sem atividade tem período de graça (3 dias)', () => {
    const fresh = { ...base, lastWorkoutAt: null, lastMealDate: null, lastWeighIn: null, hasActivePlan: false, linkedAt: '2026-09-28T10:00:00Z' };
    expect(computeFollowUp(fresh, TODAY).reasons).toEqual(['no_active_plan']);
  });
  it('atleta associado há semanas sem nada registado', () => {
    const idle = { ...base, lastWorkoutAt: null, lastMealDate: null, lastWeighIn: null, linkedAt: '2026-09-20T10:00:00Z' };
    expect(computeFollowUp(idle, TODAY).reasons).toEqual(['no_workout', 'no_meals', 'no_weigh_in']);
    expect(computeFollowUp({ ...idle, linkedAt: '2026-08-01T10:00:00Z' }, TODAY).status).toBe('inactive');
  });
  it('treino às 23h30 UTC em setembro conta como dia seguinte em Lisboa (UTC+1)', () => {
    expect(toLocalDate('2026-09-28T23:30:00Z')).toBe('2026-09-29');
    expect(computeFollowUp({ ...base, lastWorkoutAt: '2026-09-28T23:30:00Z' }, TODAY).daysSince.workout).toBe(0);
  });
  it('dias de calendário não são negativos', () => {
    expect(calendarDaysBetween('2026-10-01', TODAY)).toBe(0);
    expect(calendarDaysBetween('2026-09-01', TODAY)).toBe(28);
  });
});

describe('ordenação de "Meus Atletas"', () => {
  it('atenção primeiro, depois inativos, em dia, pendentes; desempate por nº de alertas e nome', () => {
    const mk = (fullName: string, status: any, n = 0) => ({ fullName, followUp: { status, reasons: Array(n).fill('no_meals'), daysSince: { workout: null, meal: null, weighIn: null } } });
    const out = sortByAttention([mk('Zé', 'on_track'), mk('Ana', 'pending'), mk('Bia', 'attention', 1), mk('Rui', 'attention', 3), mk('Eva', 'inactive')]);
    expect(out.map((r) => r.fullName)).toEqual(['Rui', 'Bia', 'Eva', 'Zé', 'Ana']);
  });
});
