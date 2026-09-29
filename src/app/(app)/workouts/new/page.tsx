import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { listActiveStudents } from '@/lib/data/coach';
import { createPlanAction } from '@/lib/actions/training';
import { Card, PageHeader } from '@/components/ui/card';
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from '@/components/ui/form';

export const metadata = { title: 'Novo plano' };

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const students = user.role === 'coach' ? await withUser(user.id, (db) => listActiveStudents(db)) : [];
  return (
    <>
      <PageHeader title="Novo plano" back={{ href: '/workouts', label: 'Treinos' }} />
      <Card className="max-w-xl">
        <ActionForm action={createPlanAction}>
          <TextField label="Nome do plano" name="name" required maxLength={80} placeholder="Ex.: Push / Pull / Legs" autoFocus />
          <TextAreaField label="Descrição (opcional)" name="description" maxLength={500} />
          {user.role === 'coach' && (
            <>
              <SelectField label="Para quem?" name="studentId" defaultValue={sp.template ? '' : sp.student ?? ''}>
                <option value="">Modelo (reutilizável)</option>
                {students.map((s) => <option key={s.id} value={s.id}>Aluno: {s.fullName}</option>)}
              </SelectField>
              <p className="-mt-2 text-xs text-muted">Depois de criado, podes atribuir modelos a alunos (cria-se uma cópia independente).</p>
            </>
          )}
          <SubmitButton pendingLabel="A criar…">Criar e adicionar dias</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
