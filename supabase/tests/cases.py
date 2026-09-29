from decimal import Decimal

print('\n== Vínculo coach/aluno')
as_user(C)
link_id = q("select public.coach_invite_student('S1@x.com')")[0][0]
check('coach convida por email', lambda: link_id is not None)
check('convite duplicado reutiliza o mesmo registo', lambda: q("select public.coach_invite_student('s1@x.com')")[0][0] == link_id)
check('coach não vê perfil do aluno antes de aceitar', lambda: q("select count(*) from public.profiles where id=%s", (S1,))[0][0] == 0)
as_user(S2)
check('outro aluno não vê o convite', lambda: q("select count(*) from public.my_pending_invites()")[0][0] == 0)
check('outro aluno não consegue aceitar', lambda: expect_error("select public.accept_coach_link(%s)", (link_id,), code='P0002'))
as_user(S1)
check('aluno vê o convite pendente', lambda: q("select count(*) from public.my_pending_invites()")[0][0] == 1)
check('aluno aceita (consentimento)', lambda: q("select public.accept_coach_link(%s)", (link_id,)) is not None)
as_user(C)
check('coach passa a ver o perfil do aluno', lambda: q("select count(*) from public.profiles where id=%s", (S1,))[0][0] == 1)
as_user(S2)
check('aluno não-coach não convida', lambda: expect_error("select public.coach_invite_student('x@y.com')", code='42501'))

as_user(C2)
l2 = q("select public.coach_invite_student('s1@x.com')")[0][0]
as_user(S1)
check('1 coach principal ativo: segundo aceite é bloqueado', lambda: expect_error("select public.accept_coach_link(%s)", (l2,), code='23505', msg='coach ativo'))
as_user(C2)
check('vínculo secundário bloqueado com flag desligada', lambda: expect_error("select public.coach_invite_student('s1@x.com','secondary')", code='55000'))
as_admin(); q("update public.app_config set value='true'::jsonb where key='multi_coach_enabled'")
as_user(C2); l3 = q("select public.coach_invite_student('s1@x.com','secondary')")[0][0]
as_user(S1)
check('com flag ligada, 2.º coach (secundário) é aceite', lambda: q("select public.accept_coach_link(%s)", (l3,)) is not None)
as_user(C2)
check('coach secundário passa a ver o aluno', lambda: q("select count(*) from public.profiles where id=%s", (S1,))[0][0] == 1)
as_user(S1); q("select public.end_coach_link(%s)", (l3,))
as_user(C2)
check('ao terminar vínculo, coach perde acesso de imediato', lambda: q("select count(*) from public.profiles where id=%s", (S1,))[0][0] == 0)
as_admin(); q("update public.app_config set value='false'::jsonb where key='multi_coach_enabled'")

print('\n== Dados do aluno: nutrição e peso')
as_user(S1)
q("insert into public.nutrition_profiles(student_id,sex,birth_date,height_cm) values (%s,'male','1996-05-01',180)", (S1,))
q("insert into public.body_metrics(measured_on,weight_kg) values (current_date,82)")
bm_id = q("select id from public.body_metrics")[0][0]
meal_id = q("insert into public.meals(log_date,meal_type) values (current_date,'lunch') returning id")[0][0]
item_id = q("insert into public.meal_items(meal_id,name,quantity,unit,kcal,protein_g,carbs_g,fat_g) values (%s,'Frango',200,'g',330,62,0,7) returning id", (meal_id,))[0][0]
check('aluno regista peso e refeições', lambda: q("select count(*) from public.daily_nutrition_totals")[0][0] == 1)
as_user(S2)
check('outro aluno não vê nada (separação de dados)', lambda: q("select (select count(*) from public.meals)+(select count(*) from public.body_metrics)")[0][0] == 0)
as_user(C)
check('coach lê refeições e totais', lambda: q("select kcal from public.daily_nutrition_totals where student_id=%s", (S1,))[0][0] == 330)
check('coach lê peso', lambda: q("select count(*) from public.body_metrics where student_id=%s", (S1,))[0][0] == 1)
check('coach NÃO altera refeições', lambda: rowcount("update public.meal_items set kcal=1 where id=%s", (item_id,)) == 0)
check('coach NÃO apaga peso', lambda: rowcount("delete from public.body_metrics where id=%s", (bm_id,)) == 0)
check('coach NÃO cria refeições ao aluno', lambda: expect_error("insert into public.meals(student_id,log_date,meal_type) values (%s,current_date,'snack')", (S1,), code='42501'))

def goal(student, setter, kcal=2300):
    return ("insert into public.nutrition_goals(student_id,goal_type,sex,age_years,height_cm,weight_kg,activity_level,bmr_formula,bmr,activity_factor,tdee,adjustment_pct,calories_calculated,calories_target,protein_g,carbs_g,fat_g,set_by) "
            "values (%s,'cut','male',30,180,82,'moderate','mifflin_st_jeor',1800,1.55,2790,-15,2372,%s,180,250,70,%s)", (student, kcal, setter))
check('coach define meta nutricional ao seu aluno', lambda: rowcount(*goal(S1, C)) == 1)
check('coach não define meta a aluno de outro', lambda: expect_error(*goal(S2, C), code='42501'))
check('coach não falsifica set_by', lambda: expect_error(*goal(S1, S1), code='42501'))
as_user(S1)
check('aluno também altera a meta (edição livre)', lambda: rowcount(*goal(S1, S1, 2400)) == 1)
check('histórico de metas é imutável (sem UPDATE)', lambda: rowcount("update public.nutrition_goals set calories_target=3000") == 0)
check('histórico de metas é imutável (sem DELETE)', lambda: rowcount("delete from public.nutrition_goals") == 0)
check('duplicar refeição', lambda: q("select public.duplicate_meal(%s, current_date + 1)", (meal_id,))[0][0] is not None)
check('guardar como favorita + reutilizar', lambda: q("select public.apply_saved_meal(public.save_meal_as_template(%s,'Almoço habitual'), current_date + 2)", (meal_id,))[0][0] is not None)
as_admin()
q("insert into public.foods(name,kcal_100g,protein_100g,carbs_100g,fat_100g,source) values ('Peito de Frango',165,31,0,3.6,'system')")
as_user(S1)
check('pesquisa de alimentos sem acentos', lambda: q("select count(*) from public.search_foods('frânGO')")[0][0] == 1)

print('\n== Treino: exercícios, planos e sessões')
as_admin()
sys_ex = q("insert into public.exercises(name,primary_muscle,secondary_muscles,source) values ('Supino','chest','{triceps,shoulders}','system') returning id")[0][0]
as_user(C)
coach_ex = q("insert into public.exercises(name,primary_muscle,source,owner_id) values ('Remada do coach','lats','coach',%s) returning id", (C,))[0][0]
as_user(S1)
check('aluno vê exercício do coach (vínculo ativo)', lambda: q("select count(*) from public.exercises where id=%s", (coach_ex,))[0][0] == 1)
check('aluno não cria exercício como "coach"', lambda: expect_error("insert into public.exercises(name,primary_muscle,source,owner_id) values ('x','abs','coach',%s)", (S1,), code='42501'))
as_user(S2)
check('outro aluno não vê exercício do coach', lambda: q("select count(*) from public.exercises where id=%s", (coach_ex,))[0][0] == 0)
check('pesquisa de exercícios por músculo secundário', lambda: q("select count(*) from public.search_exercises('', 'triceps')")[0][0] == 1)

as_user(C)
plan = q("insert into public.workout_plans(student_id,name) values (%s,'Push Pull Legs') returning id", (S1,))[0][0]
day = q("insert into public.workout_days(plan_id,name,position) values (%s,'Push',0) returning id", (plan,))[0][0]
pe = q("insert into public.plan_exercises(plan_id,day_id,exercise_id,position,rest_seconds) values (%s,%s,%s,0,120) returning id", (plan, day, sys_ex))[0][0]
for n, (w, r) in enumerate([(80, 10), (80, 9), (75, 10)], start=1):
    q("insert into public.plan_sets(plan_id,plan_exercise_id,set_number,target_weight_kg,target_reps_min,target_reps_max) values (%s,%s,%s,%s,%s,%s)", (plan, pe, n, w, r, r))
check('coach cria plano completo para o aluno', lambda: q("select count(*) from public.plan_sets where plan_id=%s", (plan,))[0][0] == 3)
other_plan = q("insert into public.workout_plans(student_id,name) values (%s,'Outro') returning id", (S1,))[0][0]
check('exercício de outro plano não pode ser misturado (chave composta)', lambda: expect_error(
    "insert into public.plan_sets(plan_id,plan_exercise_id,set_number) values (%s,%s,9)", (other_plan, pe), code='23503'))
v0 = q("select version from public.workout_plans where id=%s", (plan,))[0][0]
as_user(S1)
check('aluno lê e edita livremente o plano do coach', lambda: rowcount("update public.workout_days set name='Push A' where id=%s", (day,)) == 1)
check('versão do plano incrementa (controlo otimista)', lambda: rowcount("update public.workout_plans set description='ajustado pelo aluno' where id=%s", (plan,)) == 1 and q("select version from public.workout_plans where id=%s", (plan,))[0][0] > v0)
check('aluno define plano atual', lambda: q("select public.activate_plan(%s)", (plan,)) is not None)
as_user(S2)
check('outro aluno não vê o plano', lambda: q("select count(*) from public.workout_plans where id=%s", (plan,))[0][0] == 0)
check('outro aluno não escreve no plano', lambda: rowcount("update public.workout_days set name='hack' where id=%s", (day,)) == 0)

as_user(S1)
sess = q("select public.start_workout_session(%s)", (day,))[0][0]
check('sessão é snapshot do plano (nomes e séries planeadas)', lambda: q("select count(*) from public.session_sets where planned_weight_kg is not null")[0][0] == 3)
check('só 1 sessão em curso por aluno', lambda: expect_error("select public.start_workout_session(%s)", (day,), code='23505'))
sets = [r[0] for r in q("select id from public.session_sets order by set_number")]
for sid, (w, r) in zip(sets, [(80, 10), (80, 9), (75, 10)]):
    q("update public.session_sets set weight_kg=%s, reps=%s, rir=2, completed=true, completed_at=now() where id=%s", (w, r, sid))
q("update public.workout_sessions set status='completed', ended_at=now() where id=%s", (sess,))
check('volume da sessão = 80×10 + 80×9 + 75×10', lambda: q("select volume_kg from public.workout_session_summaries where session_id=%s", (sess,))[0][0] == 2270)
q("update public.workout_days set name='Renomeado depois' where id=%s", (day,))
q("delete from public.workout_plans where id=%s", (plan,))
check('sessão sobrevive à remoção do plano (histórico independente)', lambda: q("select plan_name, day_name from public.workout_sessions where id=%s", (sess,))[0] == ('Push Pull Legs', 'Push A'))
check('histórico por exercício com 1RM estimado (Epley)', lambda: q("select est_1rm_kg from public.exercise_set_history order by set_number limit 1")[0][0] == Decimal('106.7'))

print('\n== Coach vê mas não altera; correção explícita')
as_user(C)
check('coach lê sessões, séries e histórico', lambda: q("select count(*) from public.exercise_set_history where student_id=%s", (S1,))[0][0] == 3)
check('coach NÃO altera série diretamente', lambda: rowcount("update public.session_sets set reps=99 where id=%s", (sets[0],)) == 0)
check('coach NÃO apaga sessões', lambda: rowcount("delete from public.workout_sessions where id=%s", (sess,)) == 0)
check('correção exige motivo', lambda: expect_error("select public.coach_correct_session_set(%s,'',85)", (sets[0],), code='22023'))
check('correção exige alteração', lambda: expect_error("select public.coach_correct_session_set(%s,'motivo válido')", (sets[0],), code='22023'))
check('correção explícita com motivo', lambda: q("select public.coach_correct_session_set(%s,'Aluno indicou 82,5 kg no chat',82.5)", (sets[0],)) is not None)
check('série fica marcada como corrigida e valor alterado', lambda: q("select weight_kg, corrected_by=%s from public.session_sets where id=%s", (C, sets[0]))[0] == (Decimal('82.50'), True))
check('audit trail guarda antes/depois e motivo', lambda: q("select old_values->>'weight_kg', new_values->>'weight_kg', reason from public.record_corrections")[0] == ('80.00', '82.50', 'Aluno indicou 82,5 kg no chat'))
check('correção de refeição', lambda: q("select public.coach_correct_meal_item(%s,'Quantidade errada',300,495)", (item_id,)) is not None)
check('correção de peso', lambda: q("select public.coach_correct_body_metric(%s,'Balança avariada',81.4)", (bm_id,)) is not None)
check('coach comenta a sessão', lambda: rowcount("insert into public.session_comments(session_id,body) values (%s,'Boa sessão!')", (sess,)) == 1)
as_user(C2)
check('coach sem vínculo não corrige', lambda: expect_error("select public.coach_correct_session_set(%s,'motivo válido',100)", (sets[0],), code='42501'))
as_user(S2)
check('outro aluno não corrige', lambda: expect_error("select public.coach_correct_session_set(%s,'motivo válido',100)", (sets[0],), code='42501'))
check('outro aluno não vê correções', lambda: q("select count(*) from public.record_corrections")[0][0] == 0)
as_user(S1)
check('aluno vê as correções feitas aos seus registos', lambda: q("select count(*) from public.record_corrections")[0][0] == 3)
check('aluno vê o comentário', lambda: q("select count(*) from public.session_comments")[0][0] == 1)
check('aluno não apaga a marca de correção', lambda: expect_error("update public.session_sets set corrected_at=null where id=%s", (sets[0],), code='42501'))
check('aluno não altera o audit trail', lambda: rowcount("delete from public.record_corrections") == 0)
check('aluno corrige os seus próprios valores', lambda: rowcount("update public.session_sets set reps=11 where id=%s", (sets[0],)) == 1)

print('\n== Modelos e duplicação de planos')
as_user(C)
tpl = q("insert into public.workout_plans(name,is_template) values ('Modelo Full Body',true) returning id")[0][0]
d2 = q("insert into public.workout_days(plan_id,name) values (%s,'A') returning id", (tpl,))[0][0]
pe2 = q("insert into public.plan_exercises(plan_id,day_id,exercise_id) values (%s,%s,%s) returning id", (tpl, d2, sys_ex))[0][0]
q("insert into public.plan_sets(plan_id,plan_exercise_id,set_number,target_reps_min,target_reps_max) values (%s,%s,1,8,10)", (tpl, pe2))
as_user(S1)
check('aluno não vê modelos do coach', lambda: q("select count(*) from public.workout_plans where id=%s", (tpl,))[0][0] == 0)
check('aluno não cria modelos', lambda: expect_error("insert into public.workout_plans(name,is_template) values ('x',true)", code='42501'))
as_user(C)
newp = q("select public.duplicate_plan(%s,%s)", (tpl, S1))[0][0]
check('atribuir modelo a aluno = cópia profunda independente', lambda: q("select count(*) from public.plan_sets where plan_id=%s", (newp,))[0][0] == 1 and q("select student_id from public.workout_plans where id=%s", (newp,))[0][0] == S1)
check('atribuir modelo a aluno de outro coach falha', lambda: expect_error("select public.duplicate_plan(%s,%s)", (tpl, S2), code='42501'))
as_user(S1)
check('exercício de plano continua visível para o aluno', lambda: q("select count(*) from public.exercises where id=%s", (sys_ex,))[0][0] == 1)

print('\n== Dashboard "Meus Alunos"')
as_user(C)
row = q("select full_name,current_weight_kg,goal_type,calories_target,current_plan_name,last_workout_at is not null,last_meal_date is not null,link_status from public.coach_students_overview where student_id=%s", (S1,))
check('vista traz peso, meta, plano, último treino e refeição', lambda: row[0][0] == 'Aluno 1' and float(row[0][1]) == 81.4 and row[0][2] == 'cut' and row[0][5] and row[0][6] and row[0][7] == 'active')
check('vista mostra convites pendentes', lambda: (q("select public.coach_invite_student('novo@x.com')"), q("select count(*) from public.coach_students_overview where link_status='pending'")[0][0] == 1)[-1])
as_user(C2)
check('coach só vê os seus alunos', lambda: q("select count(*) from public.coach_students_overview where student_id=%s", (S1,))[0][0] == 0)

print('\n== Notas privadas, fim de vínculo, segurança de perfis')
as_user(C)
check('coach cria nota privada', lambda: rowcount("insert into public.coach_notes(student_id,body) values (%s,'Lesão no ombro direito')", (S1,)) == 1)
check('coach não cria nota de aluno alheio', lambda: expect_error("insert into public.coach_notes(student_id,body) values (%s,'x')", (S2,), code='42501'))
as_user(S1)
check('aluno nunca vê notas do coach', lambda: q("select count(*) from public.coach_notes")[0][0] == 0)
check('aluno não muda o próprio papel para coach', lambda: expect_error("update public.profiles set role='coach' where id=%s", (S1,), code='42501'))
check('aluno não vê links de outros', lambda: q("select count(*) from public.coach_students where coach_id=%s and student_id is distinct from %s", (C, S1))[0][0] == 0)
check('aluno termina vínculo', lambda: q("select public.end_coach_link(%s)", (link_id,)) is not None)
as_user(C)
check('depois de terminar: coach sem acesso a dados', lambda: q("select (select count(*) from public.meals)+(select count(*) from public.session_sets)+(select count(*) from public.body_metrics)")[0][0] == 0)
check('depois de terminar: coach não pode corrigir', lambda: expect_error("select public.coach_correct_session_set(%s,'motivo válido',100)", (sets[0],), code='42501'))
check('notas do coach mantêm-se com o coach', lambda: q("select count(*) from public.coach_notes")[0][0] == 1)
as_user(S1)
check('dados continuam com o aluno', lambda: q("select count(*) from public.session_sets")[0][0] == 3)
