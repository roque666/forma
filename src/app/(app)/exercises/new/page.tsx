import { PageHeader, Card } from '@/components/ui/card';
import { ExerciseForm } from '@/components/training/exercise-form';
import { createExerciseAction } from '@/lib/actions/training';

export const metadata = { title: 'Novo exercício' };

export default function NewExercisePage() {
  return (
    <>
      <PageHeader title="Novo exercício" back={{ href: '/exercises', label: 'Exercícios' }} />
      <Card className="max-w-2xl"><ExerciseForm action={createExerciseAction} /></Card>
    </>
  );
}
