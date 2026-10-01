import { beforeAll, describe, expect, it } from 'vitest';
import { getExerciseProgress, getInProgressSession, getPersonalRecords, getPreviousPerformance, getRecentPrEvents, getSessionDetail, listExercisesWithHistory, listSessions } from '@/lib/data/sessions';
import { listActivePlans, getActivePlan, getPlan, listPlans } from '@/lib/data/plans';
import { listExercises } from '@/lib/data/exercises';
import * as t from '@/lib/services/training';
import { as, link, makeUser, systemExercise, type TestUser } from './helpers';

const skip = process.env.SKIP_DB_TESTS === '1';
const d = skip ? describe.skip : describe;

d('treino: exercícios, planos, sessões, PRs', () => {
  let student: TestUser, other: TestUser, coach: TestUser, bench: string, planId: string, dayId: string, peId: string;

  beforeAll(async () => {
    student = await makeUser('student', 'atleta-treino');
    other = await makeUser('student', 'outro-treino');
    coach = await makeUser('coach', 'coach-treino');
    await link(coach, student);
    bench = await systemExercise('Supino reto com barra');
  });

  it('CRUD de exercício personalizado (atleta) e arquivo quando tem histórico', async () => {
    const id = await as(student, (db) => t.createExercise(db, student, { name: 'Remada Pendlay', primaryMuscle: 'upper_back', secondaryMuscles: ['biceps'], trackingType: 'weight_reps', equipment: 'Barra' }));
    const found = await as(student, (db) => listExercises(db, { q: 'pendlay' }));
    expect(found.map((e) => e.id)).toContain(id);
    // invisível a outro atleta
    expect((await as(other, (db) => listExercises(db, { q: 'pendlay' }))).length).toBe(0);
    await as(student, (db) => t.updateExercise(db, id, { name: 'Remada Pendlay (barra)', primaryMuscle: 'upper_back', secondaryMuscles: ['biceps', 'lats'], trackingType: 'weight_reps' }));
    expect((await as(student, (db) => listExercises(db, { q: 'pendlay' })))[0].secondaryMuscles).toEqual(['biceps', 'lats']);
    // outro atleta não consegue editar nem apagar
    await expect(as(other, (db) => t.updateExercise(db, id, { name: 'hack', primaryMuscle: 'chest', secondaryMuscles: [], trackingType: 'weight_reps' }))).rejects.toMatchObject({ code: 'P0002' });
    await expect(as(other, (db) => t.removeExercise(db, id))).rejects.toMatchObject({ code: 'P0002' });
    expect(await as(student, (db) => t.removeExercise(db, id))).toBe('deleted');
  });

  it('exercícios do sistema não são editáveis', async () => {
    await expect(as(student, (db) => t.updateExercise(db, bench, { name: 'x', primaryMuscle: 'chest', secondaryMuscles: [], trackingType: 'weight_reps' }))).rejects.toMatchObject({ code: 'P0002' });
  });

  it('cria plano → dia → exercício → séries; primeiro plano fica ativo', async () => {
    planId = await as(student, (db) => t.createPlan(db, student, { name: 'Push Pull Legs' }));
    dayId = await as(student, (db) => t.addDay(db, planId, 'Push', [1]));
    peId = await as(student, (db) => t.addPlanExercise(db, dayId, bench));
    await as(student, (db) => t.savePlanSets(db, peId, [
      { setType: 'normal', repsMin: 10, repsMax: 10, weightKg: 80 },
      { setType: 'normal', repsMin: 9, repsMax: 9, weightKg: 80 },
      { setType: 'normal', repsMin: 10, repsMax: 10, weightKg: 75 },
    ]));
    await as(student, (db) => t.updatePlanExercise(db, peId, { restSeconds: 120, notes: 'Pausa no peito' }));
    const plan = await as(student, (db) => getPlan(db, planId));
    expect(plan!.isActive).toBe(true);
    expect(plan!.days[0].weekdays).toEqual([1]);
    const ex = plan!.days[0].exercises[0];
    expect(ex.restSeconds).toBe(120);
    expect(ex.sets.map((s) => [s.targetWeightKg, s.targetRepsMin])).toEqual([[80, 10], [80, 9], [75, 10]]);
    expect((await as(student, (db) => getActivePlan(db, student.id)))!.id).toBe(planId);
  });

  it('segundo plano não fica ativo; ativar acrescenta ao calendário; duplicar faz cópia profunda', async () => {
    const p2 = await as(student, (db) => t.createPlan(db, student, { name: 'Full body' }));
    expect((await as(student, (db) => getPlan(db, p2)))!.isActive).toBe(false);
    const copy = await as(student, (db) => t.duplicatePlan(db, planId));
    const c = await as(student, (db) => getPlan(db, copy));
    expect(c!.name).toBe('Push Pull Legs (cópia)');
    expect(c!.days[0].exercises[0].sets).toHaveLength(3);
    await as(student, (db) => t.activatePlan(db, p2));
    // ativar já não desativa os outros: ficam os dois no calendário
    expect((await as(student, (db) => listPlans(db, student.id))).filter((p) => p.isActive)).toHaveLength(2);
    expect((await as(student, (db) => listActivePlans(db, student.id))).map((p) => p.id).sort()).toEqual([planId, p2].sort());
  });

  it('reordenar dias e exercícios', async () => {
    const d2 = await as(student, (db) => t.addDay(db, planId, 'Pull', []));
    await as(student, (db) => t.moveDay(db, d2, 'up'));
    expect((await as(student, (db) => getPlan(db, planId)))!.days.map((x) => x.name)).toEqual(['Pull', 'Push']);
    await as(student, (db) => t.moveDay(db, d2, 'down'));
    expect((await as(student, (db) => getPlan(db, planId)))!.days.map((x) => x.name)).toEqual(['Push', 'Pull']);
    await as(student, (db) => t.deleteDay(db, d2));
  });

  let s1: string;
  it('sessão 1: snapshot do plano, registo de séries, sem PR no primeiro registo, fim do treino', async () => {
    const started = await as(student, (db) => t.startSession(db, student.id, dayId));
    s1 = started.id;
    expect(started.resumed).toBe(false);
    expect((await as(student, (db) => t.startSession(db, student.id, dayId))).resumed).toBe(true); // retoma o treino em curso
    const det = await as(student, (db) => getSessionDetail(db, s1));
    expect(det!.planName).toBe('Push Pull Legs');
    expect(det!.exercises[0].sets.map((x) => x.plannedWeightKg)).toEqual([80, 80, 75]);
    // termina sem séries concluídas → recusado
    await expect(as(student, (db) => t.finishSession(db, s1))).rejects.toMatchObject({ code: '22023' });
    for (const [i, [w, r]] of ([[80, 10], [80, 9], [75, 10]] as const).entries()) {
      const res = await as(student, (db) => t.saveSet(db, { setId: det!.exercises[0].sets[i].id, weightKg: w, reps: r, rir: 2, completed: true }));
      expect(res.prs).toEqual([]); // primeiro registo não é PR
    }
    await as(student, (db) => t.finishSession(db, s1, 'Boa sessão'));
    expect(await as(student, (db) => getInProgressSession(db, student.id))).toBeNull();
    const list = await as(student, (db) => listSessions(db, student.id));
    expect(list).toHaveLength(1);
    expect(list[0].volumeKg).toBe(80 * 10 + 80 * 9 + 75 * 10);
    const recs = await as(student, (db) => getPersonalRecords(db, student.id, bench));
    const by = Object.fromEntries(recs.filter((r) => r.prType !== 'reps_at_weight').map((r) => [r.prType, r.value]));
    expect(by).toMatchObject({ max_weight: 80, est_1rm: 106.7, max_reps: 10, best_set_volume: 800, session_volume: 2270 });
  });

  it('sessão 2: deteta PRs (peso máximo, reps, 1RM) e distingue o que não é PR', async () => {
    const { id } = await as(student, (db) => t.startSession(db, student.id, dayId));
    const det = await as(student, (db) => getSessionDetail(db, id));
    const sets = det!.exercises[0].sets;
    // valores anteriores por série
    const prev = await as(student, (db) => getPreviousPerformance(db, student.id, id, [bench]));
    expect(prev[bench][1]).toMatchObject({ weightKg: 80, reps: 10 });

    // 82,5 × 8 → novo peso máximo; 1RM = 104,5 (< 106,7) → não é PR de 1RM
    const r1 = await as(student, (db) => t.saveSet(db, { setId: sets[0].id, weightKg: 82.5, reps: 8, rir: 2, completed: true }));
    expect(r1.prs.map((p) => p.prType).sort()).toEqual(['max_weight']);
    expect(r1.prs[0]).toMatchObject({ value: 82.5, previousValue: 80, exerciseName: 'Supino reto com barra' });

    // 80 × 11 → mais reps (11 > 10) e 1RM 109,3 > 106,7; peso máximo não
    const r2 = await as(student, (db) => t.saveSet(db, { setId: sets[1].id, weightKg: 80, reps: 11, rir: 1, completed: true }));
    expect(r2.prs.map((p) => p.prType).sort()).toEqual(['best_set_volume', 'est_1rm', 'max_reps', 'reps_at_weight']);
    const e1 = r2.prs.find((p) => p.prType === 'est_1rm')!;
    expect(e1.value).toBe(109.3);

    // série que não bate nada
    const r3 = await as(student, (db) => t.saveSet(db, { setId: sets[2].id, weightKg: 70, reps: 8, rir: 3, completed: true }));
    expect(r3.prs).toEqual([]);

    // gravar de novo o mesmo valor não repete o PR
    const again = await as(student, (db) => t.saveSet(db, { setId: sets[1].id, weightKg: 80, reps: 11, rir: 1, completed: true }));
    expect(again.prs).toEqual([]);

    await as(student, (db) => t.finishSession(db, id));
    const events = await as(student, (db) => getRecentPrEvents(db, student.id, 20));
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it('adicionar/remover séries e exercícios durante o treino', async () => {
    const { id } = await as(student, (db) => t.startSession(db, student.id, null)); // treino livre
    const se = await as(student, (db) => t.addSessionExercise(db, id, bench));
    const added = await as(student, (db) => t.addSet(db, se));
    expect(added.setNumber).toBe(2);
    const added3 = await as(student, (db) => t.addSet(db, se));
    await as(student, (db) => t.removeSet(db, added.id));
    const det = await as(student, (db) => getSessionDetail(db, id));
    expect(det!.exercises[0].sets.map((s) => s.setNumber)).toEqual([1, 2]);
    expect(det!.exercises[0].sets[1].id).toBe(added3.id);
    await as(student, (db) => t.discardSession(db, id));
    expect((await as(student, (db) => getSessionDetail(db, id)))!.status).toBe('discarded');
  });

  it('progressão por exercício e lista de exercícios com histórico', async () => {
    const pts = await as(student, (db) => getExerciseProgress(db, student.id, bench));
    expect(pts).toHaveLength(2);
    expect(pts[0].topWeightKg).toBe(80);
    expect(pts[1].topWeightKg).toBe(82.5);
    const list = await as(student, (db) => listExercisesWithHistory(db, student.id));
    expect(list[0]).toMatchObject({ exerciseId: bench, sessions: 2 });
  });

  it('editar uma série antiga recalcula os recordes (o histórico manda)', async () => {
    const before = (await as(student, (db) => getPersonalRecords(db, student.id, bench))).find((r) => r.prType === 'max_weight')!;
    expect(before.value).toBe(82.5);
    const sessions = await as(student, (db) => listSessions(db, student.id));
    const latest = await as(student, (db) => getSessionDetail(db, sessions[0].sessionId));
    const set = latest!.exercises[0].sets[0];
    await as(student, (db) => t.saveSet(db, { setId: set.id, weightKg: 75, reps: 8, rir: 2, completed: true })); // corrige 82,5 → 75
    const after = (await as(student, (db) => getPersonalRecords(db, student.id, bench))).find((r) => r.prType === 'max_weight')!;
    expect(after.value).toBe(80);
  });

  it('apagar sessão recalcula recordes', async () => {
    const sessions = await as(student, (db) => listSessions(db, student.id));
    await as(student, (db) => t.deleteSession(db, student.id, sessions[0].sessionId));
    const recs = await as(student, (db) => getPersonalRecords(db, student.id, bench));
    expect(recs.find((r) => r.prType === 'max_reps')!.value).toBe(10);
  });

  it('coach vê o atleta mas não altera sessões; outro atleta não vê nada', async () => {
    expect((await as(coach, (db) => listSessions(db, student.id))).length).toBe(1);
    expect((await as(coach, (db) => getPersonalRecords(db, student.id))).length).toBeGreaterThan(0);
    expect((await as(other, (db) => listSessions(db, student.id)))).toEqual([]);
    expect((await as(other, (db) => getPersonalRecords(db, student.id)))).toEqual([]);
    const sessions = await as(student, (db) => listSessions(db, student.id));
    const det = await as(coach, (db) => getSessionDetail(db, sessions[0].sessionId));
    await expect(as(coach, (db) => t.saveSet(db, { setId: det!.exercises[0].sets[0].id, weightKg: 200, reps: 10, rir: null, completed: true }))).rejects.toMatchObject({ code: 'P0002' });
    await expect(as(coach, (db) => t.deleteSession(db, student.id, sessions[0].sessionId))).rejects.toMatchObject({ code: 'P0002' });
  });

  it('coach cria plano para o atleta e atribui um modelo', async () => {
    const forStudent = await as(coach, (db) => t.createPlan(db, coach, { name: 'Plano do coach', studentId: student.id }));
    const plan = await as(student, (db) => getPlan(db, forStudent));
    expect(plan).toMatchObject({ name: 'Plano do coach', createdByCoach: true, studentId: student.id });
    // o atleta edita livremente
    await as(student, (db) => t.updatePlan(db, forStudent, { name: 'Plano do coach (ajustado)' }));
    // modelo: só coach; invisível para atletas
    await expect(as(student, (db) => t.createPlan(db, student, { name: 'Modelo', isTemplate: true }))).rejects.toMatchObject({ code: '42501' });
    const tpl = await as(coach, (db) => t.createPlan(db, coach, { name: 'Modelo Full Body', isTemplate: true }));
    const dd = await as(coach, (db) => t.addDay(db, tpl, 'A', [2, 4]));
    await as(coach, (db) => t.addPlanExercise(db, dd, bench));
    expect(await as(student, (db) => getPlan(db, tpl))).toBeNull();
    const assigned = await as(coach, (db) => t.assignTemplate(db, tpl, student.id));
    const ap = await as(student, (db) => getPlan(db, assigned));
    expect(ap!.days[0].weekdays).toEqual([2, 4]);
    expect(ap!.isTemplate).toBe(false);
    // coach não atribui a atleta de outro
    await expect(as(coach, (db) => t.assignTemplate(db, tpl, other.id))).rejects.toMatchObject({ code: '42501' });
  });
});
