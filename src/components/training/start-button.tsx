import { Play } from 'lucide-react';
import { startSessionAction } from '@/lib/actions/training';
import { SubmitButton } from '@/components/ui/form';

/** Botão grande para iniciar (ou retomar) um treino. dayId vazio = treino livre. */
export function StartWorkoutButton({ dayId, label = 'Iniciar treino', variant = 'primary', size = 'lg', className }: { dayId?: string | null; label?: string; variant?: 'primary' | 'outline' | 'secondary'; size?: 'lg' | 'md'; className?: string }) {
  return (
    <form action={startSessionAction} className={className}>
      <input type="hidden" name="dayId" value={dayId ?? ''} />
      <SubmitButton variant={variant} size={size} className="w-full" pendingLabel="A iniciar…"><Play className="h-5 w-5" /> {label}</SubmitButton>
    </form>
  );
}
