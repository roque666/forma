-- 0014: novo papel "fisioterapeuta" (o valor do enum só pode ser usado depois de confirmado, por isso fica sozinho).
alter type public.user_role add value if not exists 'physio';
