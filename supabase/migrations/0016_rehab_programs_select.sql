-- O select de rehab_programs não pode consultar a própria tabela via função: num
-- INSERT ... RETURNING a função não vê a linha acabada de inserir. Passa a ser inline.
drop policy if exists rehab_programs_select on public.rehab_programs;
create policy rehab_programs_select on public.rehab_programs for select using (
  patient_id = auth.uid () or (physio_id = auth.uid () and public.is_physio_of (patient_id)));
