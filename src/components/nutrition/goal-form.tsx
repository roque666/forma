'use client';

import { useMemo, useState } from 'react';
import { saveGoalAction } from '@/lib/actions/nutrition';
import { ACTIVITY_LABELS_PT, ageFromBirthDate, buildScenarios, calculateNutrition, DEFAULT_ADJUSTMENT_PCT, NUTRITION_DISCLAIMER_PT, type GoalType, type WarningCode } from '@/lib/nutrition/calculator';
import { ActionForm, NumberField, SelectField, SubmitButton, TextField } from '@/components/ui/form';
import { Alert } from '@/components/ui/feedback';
import { Card, CardTitle } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { fmtNum, GOAL_LABELS } from '@/lib/labels';

const WARN_PT: Record<WarningCode, string> = {
  under_min_calories: 'As calorias ficam abaixo do mínimo geralmente recomendado (1500 kcal homens / 1200 kcal mulheres). Considera um défice menor ou acompanhamento profissional.',
  minor_age: 'Para menores de 18 anos, estes valores são apenas indicativos — fala com um profissional de saúde.',
  aggressive_deficit: 'Défice agressivo (>25%): aumenta o risco de perda de massa muscular e fadiga.',
  aggressive_surplus: 'Excedente elevado (>20%): tende a aumentar sobretudo gordura corporal.',
  macros_exceed_calories: 'Proteína e gordura já ultrapassam as calorias definidas — hidratos ficam a zero. Revê os valores.',
  manual_override: 'Estás a usar calorias manuais em vez das calculadas.',
};

export interface GoalDefaults { sex?: string; birthDate?: string; heightCm?: number; weightKg?: number; activityLevel?: string; bmrFormula?: string; bodyFatPct?: number | null; goal?: GoalType }

export function GoalForm({ defaults, studentId, today, coachMode, relaxed }: { defaults: GoalDefaults; studentId?: string; today: string; coachMode?: boolean; /** coach a usar a app como atleta: sem avisos de segurança */ relaxed?: boolean }) {
  const [goal, setGoal] = useState<GoalType>(defaults.goal ?? 'maintenance');
  const [f, setF] = useState({
    sex: defaults.sex ?? '', birthDate: defaults.birthDate ?? '', heightCm: defaults.heightCm?.toString() ?? '', weightKg: defaults.weightKg?.toString() ?? '',
    activityLevel: defaults.activityLevel ?? 'moderate', bmrFormula: defaults.bmrFormula ?? 'mifflin_st_jeor', bodyFatPct: defaults.bodyFatPct?.toString() ?? '',
    adjustmentPct: '', manualCalories: '', proteinGPerKg: '', fatGPerKg: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (s: string) => { const t = s.trim().replace(',', '.'); return t === '' ? undefined : Number(t); };

  const calc = useMemo(() => {
    try {
      if (!f.sex || !f.birthDate) return null;
      const age = ageFromBirthDate(f.birthDate, new Date(today + 'T12:00:00Z'));
      const r = calculateNutrition({
        sex: f.sex as 'male' | 'female', ageYears: age, heightCm: Number(f.heightCm.replace(',', '.')), weightKg: Number(f.weightKg.replace(',', '.')), activityLevel: f.activityLevel as any, goal,
        bodyFatPct: num(f.bodyFatPct) ?? null, bmrFormula: f.bmrFormula as any, adjustmentPct: num(f.adjustmentPct), manualCalories: num(f.manualCalories) ?? null,
        proteinGPerKg: num(f.proteinGPerKg), fatGPerKg: num(f.fatGPerKg),
      });
      return { r, err: null as string | null };
    } catch (e) { return { r: null, err: (e as Error).message }; }
  }, [f, goal, today]);
  const scenarios = calc?.r ? buildScenarios(calc.r.tdee, { cut: goal === 'cut' ? num(f.adjustmentPct) : undefined, bulk: goal === 'bulk' ? num(f.adjustmentPct) : undefined }) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <ActionForm action={saveGoalAction}>
        {studentId && <input type="hidden" name="studentId" value={studentId} />}
        <input type="hidden" name="goal" value={goal} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Objetivo</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Objetivo">
            {(['cut', 'maintenance', 'bulk'] as const).map((g) => {
              const sc = scenarios?.find((s) => s.goal === g);
              return (
                <button type="button" key={g} role="radio" aria-checked={goal === g} onClick={() => setGoal(g)}
                  className={cn('rounded-2xl border-2 px-2 py-3 text-center transition active:scale-[0.98]', goal === g ? 'border-accent-text bg-accent/15' : 'border-line bg-surface')}>
                  <span className="block text-base font-bold">{GOAL_LABELS[g]}</span>
                  <span className="block text-xs text-muted">{g === 'maintenance' ? 'TDEE' : `${g === 'cut' ? '−' : '+'}${DEFAULT_ADJUSTMENT_PCT[g]}%`}</span>
                  {sc && <span className="mt-1 block text-sm font-semibold tabular-nums">{fmtNum(sc.calories, 0)} kcal</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Sexo" name="sex" value={f.sex} onChange={set('sex')} required><option value="" disabled>Escolher…</option><option value="male">Masculino</option><option value="female">Feminino</option></SelectField>
          <TextField label="Data de nascimento" name="birthDate" type="date" value={f.birthDate} onChange={set('birthDate')} required />
          <NumberField label="Altura (cm)" name="heightCm" value={f.heightCm} onChange={set('heightCm')} required />
          <NumberField label="Peso (kg)" name="weightKg" value={f.weightKg} onChange={set('weightKg')} required />
        </div>
        <SelectField label="Nível de atividade" name="activityLevel" value={f.activityLevel} onChange={set('activityLevel')}>
          {Object.entries(ACTIVITY_LABELS_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectField>
        <details className="rounded-xl border border-line p-3" open={!!(defaults.bodyFatPct)}>
          <summary className="cursor-pointer text-sm font-semibold">Opções avançadas</summary>
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Gordura corporal (%)" name="bodyFatPct" value={f.bodyFatPct} onChange={set('bodyFatPct')} hint="Opcional; permite Katch-McArdle" />
              <SelectField label="Fórmula BMR" name="bmrFormula" value={f.bmrFormula} onChange={set('bmrFormula')}><option value="mifflin_st_jeor">Mifflin-St Jeor</option><option value="katch_mcardle">Katch-McArdle (usa % gordura)</option></SelectField>
              {goal !== 'maintenance' && <NumberField label={`${goal === 'cut' ? 'Défice' : 'Excedente'} (%)`} name="adjustmentPct" value={f.adjustmentPct} onChange={set('adjustmentPct')} placeholder={String(DEFAULT_ADJUSTMENT_PCT[goal])} hint="Vazio = valor por defeito" />}
              <NumberField label="Calorias manuais (kcal)" name="manualCalories" value={f.manualCalories} onChange={set('manualCalories')} hint="Substitui o cálculo" />
              <NumberField label="Proteína (g/kg)" name="proteinGPerKg" value={f.proteinGPerKg} onChange={set('proteinGPerKg')} placeholder="por defeito" />
              <NumberField label="Gordura (g/kg)" name="fatGPerKg" value={f.fatGPerKg} onChange={set('fatGPerKg')} placeholder="0,9" />
            </div>
            <TextField label="Nota (opcional)" name="note" maxLength={300} placeholder="Ex.: início de bulk" />
          </div>
        </details>
        <SubmitButton size="lg" disabled={!calc?.r} pendingLabel="A guardar…">{coachMode ? 'Definir objetivo do atleta' : 'Guardar objetivo'}</SubmitButton>
        {!relaxed && <p className="text-xs text-muted">{NUTRITION_DISCLAIMER_PT}</p>}
      </ActionForm>

      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-live="polite">
        <Card>
          <CardTitle>Resultado</CardTitle>
          {!calc && <p className="text-sm text-muted">Preenche os teus dados para ver o cálculo.</p>}
          {calc?.err && <Alert tone="error">{calc.err}</Alert>}
          {calc?.r && (() => { const r = calc.r; return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-surface2 p-3"><p className="text-xs text-muted">BMR</p><p className="text-xl font-bold tabular-nums">{fmtNum(r.bmr, 0)}</p></div><div className="rounded-xl bg-surface2 p-3"><p className="text-xs text-muted">TDEE</p><p className="text-xl font-bold tabular-nums">{fmtNum(r.tdee, 0)}</p></div></div>
              <div className="rounded-xl bg-accent/15 p-3 text-center"><p className="text-xs text-muted">Objetivo diário {r.adjustmentPct !== 0 && `(${r.adjustmentPct > 0 ? '+' : ''}${r.adjustmentPct}%)`}</p><p className="text-3xl font-extrabold tabular-nums">{fmtNum(r.caloriesTarget, 0)} <span className="text-base font-medium">kcal</span></p></div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div><p className="font-bold text-protein tabular-nums">{r.proteinG} g</p><p className="text-[11px] text-muted">Prot. {r.macroPct.protein}%</p></div>
                <div><p className="font-bold text-carbs tabular-nums">{r.carbsG} g</p><p className="text-[11px] text-muted">Hidr. {r.macroPct.carbs}%</p></div>
                <div><p className="font-bold text-fat tabular-nums">{r.fatG} g</p><p className="text-[11px] text-muted">Gord. {r.macroPct.fat}%</p></div>
              </div>
              {!relaxed && r.warnings.map((w) => <Alert key={w.code} tone={w.severity === 'warning' ? 'warn' : 'info'}>{WARN_PT[w.code]}</Alert>)}
            </div>); })()}
        </Card>
      </aside>
    </div>
  );
}
