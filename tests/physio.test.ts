import { beforeAll, describe, expect, it } from 'vitest';
import * as ph from '@/lib/physio/physio';
import * as t from '@/lib/services/training';
import { listExercises } from '@/lib/data/exercises';
import { as, link, linkPhysio, makeUser, systemExercise, type TestUser } from './helpers';

const skip = process.env.SKIP_DB_TESTS === '1';
const d = skip ? describe.skip : describe;
const W = { weekStart: '2000-01-03', weekEnd: '2100-01-09', today: '2026-10-06' };

d('fisioterapia: isolamento e programas', () => {
  let physio: TestUser, physio2: TestUser, patient: TestUser, stranger: TestUser, coach: TestUser, ex: string, programId: string, itemId: string, linkId: string;

  beforeAll(async () => {
    physio = await makeUser('physio', 'fisio-a');
    physio2 = await makeUser('physio', 'fisio-b');
    patient = await makeUser('student', 'paciente-a');
    stranger = await makeUser('student', 'estranho-a');
    coach = await makeUser('coach', 'coach-fisio');
    ex = await systemExercise('Supino reto com barra');
    await link(coach, patient);
    // dados privados do paciente que o fisio NUNCA deve ver
    await as(patient, (db) => db.exec(`insert into public.body_metrics (student_id, measured_on, weight_kg) values ($1, '2026-10-01', 80)`, [patient.id]));
    await as(patient, (db) => db.exec(`insert into public.workout_sessions (student_id, status, started_at) values ($1, 'in_progress', now())`, [patient.id]));
    linkId = await linkPhysio(physio, patient);
  });

  it('convite exige aceitação do paciente; só o próprio vê o convite', async () => {
    const p3 = await makeUser('student', 'paciente-convite');
    const id = await as(physio, (db) => ph.invitePatient(db, p3.email));
    expect((await as(physio, (db) => ph.getPatient(db, p3.id)))).toBeNull();
    expect((await as(p3, (db) => ph.myPendingPhysioInvites(db))).map((i) => i.linkId)).toContain(id);
    expect((await as(stranger, (db) => ph.myPendingPhysioInvites(db))).length).toBe(0);
    await expect(as(stranger, (db) => ph.acceptPhysioLink(db, id))).rejects.toBeTruthy();
    await as(p3, (db) => ph.acceptPhysioLink(db, id));
    expect(await as(physio, (db) => ph.getPatient(db, p3.id))).not.toBeNull();
  });

  it('só um fisioterapeuta convida', async () => {
    await expect(as(patient, (db) => ph.invitePatient(db, stranger.email))).rejects.toBeTruthy();
    await expect(as(coach, (db) => ph.invitePatient(db, stranger.email))).rejects.toBeTruthy();
  });

  it('o fisio vê o perfil do paciente, mas não treinos, nutrição nem peso', async () => {
    expect((await as(physio, (db) => ph.getPatient(db, patient.id)))?.fullName).toBeTruthy();
    expect((await as(physio, (db) => db.query('select 1 from public.workout_sessions where student_id = $1', [patient.id]))).length).toBe(0);
    expect((await as(physio, (db) => db.query('select 1 from public.body_metrics where student_id = $1', [patient.id]))).length).toBe(0);
    expect((await as(physio, (db) => db.query('select 1 from public.meals where student_id = $1', [patient.id]))).length).toBe(0);
    expect(await as(physio2, (db) => ph.getPatient(db, patient.id))).toBeNull();
  });

  it('cria programa, adiciona exercícios e o paciente vê-os', async () => {
    programId = await as(physio, (db) => ph.createProgram(db, physio.id, patient.id, { name: 'Joelho – fase 1', notes: 'Devagar' }));
    itemId = await as(physio, (db) => ph.addItem(db, programId, ex));
    await as(physio, (db) => ph.updateItem(db, itemId, { sets: 3, reps: 10, weeklyTarget: 3 }));
    const seen = await as(patient, (db) => ph.listPrograms(db, patient.id, W));
    expect(seen.map((p) => p.id)).toContain(programId);
    expect(seen[0].items[0]).toMatchObject({ sets: 3, reps: 10, weeklyTarget: 3, exerciseId: ex });
    // fisio de fora, estranho e coach não veem
    for (const u of [physio2, stranger, coach]) expect((await as(u, (db) => ph.listPrograms(db, patient.id, W))).length).toBe(0);
  });

  it('o paciente não edita o programa; outro fisio também não', async () => {
    await expect(as(patient, (db) => ph.updateProgram(db, programId, { name: 'x' }))).rejects.toBeTruthy();
    await expect(as(patient, (db) => ph.addItem(db, programId, ex))).rejects.toBeTruthy();
    await as(physio2, (db) => ph.updateProgram(db, programId, { name: 'hack' })).catch(() => undefined);
    expect((await as(patient, (db) => ph.getProgram(db, programId, W)))?.name).toBe('Joelho – fase 1');
    await expect(as(physio2, (db) => ph.createProgram(db, physio2.id, patient.id, { name: 'intruso' }))).rejects.toBeTruthy();
  });

  it('registos: só o paciente regista; fisio acompanha; dor 0–10', async () => {
    await as(patient, (db) => ph.logExercise(db, patient.id, itemId, { doneOn: '2026-10-06', pain: 3, note: 'ok' }));
    await expect(as(physio, (db) => ph.logExercise(db, physio.id, itemId, { doneOn: '2026-10-06' }))).rejects.toBeTruthy();
    await expect(as(stranger, (db) => ph.logExercise(db, stranger.id, itemId, { doneOn: '2026-10-06' }))).rejects.toBeTruthy();
    await expect(as(patient, (db) => ph.logExercise(db, patient.id, itemId, { doneOn: '2026-10-06', pain: 11 }))).rejects.toBeTruthy();
    const logs = await as(physio, (db) => ph.listLogs(db, patient.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].pain).toBe(3);
    expect((await as(physio2, (db) => ph.listLogs(db, patient.id))).length).toBe(0);
    const row = (await as(physio, (db) => ph.listPatients(db, W.weekStart, W.weekEnd))).find((r) => r.patientId === patient.id)!;
    expect(row).toMatchObject({ weekDone: 1, weekTarget: 3, lastPain: 3 });
    // o fisio não apaga registos do paciente; o paciente sim
    await expect(as(physio, (db) => ph.undoLog(db, logs[0].id))).rejects.toBeTruthy();
    await as(patient, (db) => ph.undoLog(db, logs[0].id));
    expect((await as(physio, (db) => ph.listLogs(db, patient.id))).length).toBe(0);
  });

  it('exercício do fisio fica visível ao paciente só via programa', async () => {
    const mine = await as(physio, (db) => t.createExercise(db, { id: physio.id, role: 'physio' }, { name: 'Elevação de calcanhar sentado', primaryMuscle: 'calves', secondaryMuscles: [], trackingType: 'bodyweight_reps' }));
    expect((await as(patient, (db) => listExercises(db, { q: 'calcanhar sentado' }))).length).toBe(0);
    const it2 = await as(physio, (db) => ph.addItem(db, programId, mine));
    await as(physio, (db) => ph.updateItem(db, it2, { weeklyTarget: 2 }));
    expect((await as(patient, (db) => listExercises(db, { q: 'calcanhar sentado' }))).map((e) => e.id)).toContain(mine);
    expect((await as(physio, (db) => listExercises(db, { q: 'calcanhar sentado' })))[0].source).toBe('physio');
    expect((await as(stranger, (db) => listExercises(db, { q: 'calcanhar sentado' }))).length).toBe(0);
  });

  it('terminar o vínculo retira o acesso ao fisio', async () => {
    await as(patient, (db) => ph.endPhysioLink(db, linkId));
    expect(await as(physio, (db) => ph.getPatient(db, patient.id))).toBeNull();
    expect((await as(physio, (db) => ph.listPrograms(db, patient.id, W))).length).toBe(0);
    expect((await as(physio, (db) => ph.listLogs(db, patient.id))).length).toBe(0);
    await expect(as(physio, (db) => ph.addItem(db, programId, ex))).rejects.toBeTruthy();
  });
});
