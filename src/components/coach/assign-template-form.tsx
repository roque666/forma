'use client';

import { assignTemplateAction } from '@/lib/actions/training';
import { ActionForm, SelectField, SubmitButton } from '@/components/ui/form';

export function AssignTemplateForm({ studentId, templates }: { studentId: string; templates: { id: string; name: string }[] }) {
  return (
    <ActionForm action={assignTemplateAction} className="flex flex-wrap items-end gap-2 space-y-0">
      <input type="hidden" name="studentId" value={studentId} />
      <SelectField label="Atribuir modelo" name="templateId" wrapperClassName="min-w-48 flex-1" defaultValue="" required>
        <option value="" disabled>Escolher modelo…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </SelectField>
      <SubmitButton size="md">Atribuir</SubmitButton>
    </ActionForm>
  );
}
