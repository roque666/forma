# Forma — treino + nutrição

App web (Next.js 16, React 19, TypeScript, Tailwind, Postgres) para alunos e coaches. UI em pt-PT.

## Arranque rápido
```bash
npm install
cp .env.example .env.local        # ajusta DATABASE_URL, COACH_SIGNUP_CODE, APP_URL
npm run db:migrate                # aplica supabase/migrations
npm run db:seed:system            # exercícios e alimentos base
npm run db:seed:demo              # dados de demonstração (nunca em produção sem ALLOW_DEMO_SEED=1)
npm run dev
```
Sem Postgres local: `pip install pgserver && python scripts/dev-db.py` imprime uma `DATABASE_URL` (defina também `DB_STUB_EXTENSIONS=1`).

## Contas demo (palavra-passe `Demo12345678`)
- Coach: `coach@demo.pt`
- Alunos: `ana@demo.pt`, `rui@demo.pt`, `sofia@demo.pt`, `tiago@demo.pt` (este tem um convite pendente)

## Segurança
- Isolamento de dados por **RLS no Postgres**: cada pedido corre com `set local role authenticated` e `request.jwt.claim.sub` = utilizador (`withUser`). `withAdmin` só é usado em registo, sessões, tentativas de login e criação de contas de aluno pelo coach.
- Coach só vê dados de alunos com ligação ativa; correções do coach passam por funções auditadas.
- Autenticação própria: scrypt, cookie de sessão httpOnly, rate limiting, mudança de palavra-passe forçada para contas criadas por coach.
- O utilizador da `DATABASE_URL` tem de poder fazer `SET ROLE authenticated`.

## Scripts
`npm test` (vitest, 60 testes), `npm run test:e2e` (Playwright, 16 testes: os 15 fluxos + isolamento), `npm run typecheck`, `npm run build`.

## Limitações conhecidas
- Emails (convites, recuperação) só vão para log / `.outbox`; falta configurar um fornecedor.
- Registo de coach exige `COACH_SIGNUP_CODE`.
- Sem manifest PWA. Valores nutricionais base são aproximados (verificar licença/fonte INSA).
- Ainda por validar contra um Supabase real (`supabase db reset`).
