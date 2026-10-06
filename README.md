# Forma — treino + nutrição

App web (Next.js 16, React 19, TypeScript, Tailwind, Postgres) para atletas e coaches. UI em pt-PT.

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
- Atletas: `ana@demo.pt`, `rui@demo.pt`, `sofia@demo.pt`, `tiago@demo.pt` (este tem um convite pendente)

## Instalar no telemóvel (PWA)
A app é uma PWA (manifest, ícones, página offline). Com a app publicada em **HTTPS**: Android/Chrome → menu ⋮ → "Instalar aplicação"; iPhone/Safari → Partilhar → "Adicionar ao ecrã principal". O service worker só guarda ficheiros estáticos, nunca páginas nem dados autenticados; sem rede mostra uma página "Sem ligação".
Para uso pessoal, o mais simples é alojar a app (ex.: Vercel/Render/Fly) com um Postgres gratuito (Neon/Supabase) e definir `DATABASE_URL`, `APP_URL` e `COACH_SIGNUP_CODE`.

## Coach como atleta
Uma conta de coach tem um interruptor **Coach ⇄ O meu treino**. Em "O meu treino" usa a app de atleta com dados só seus e, por ser coach, pode também: partilhar exercícios/alimentos com os seus atletas, editar a biblioteca base, transformar planos seus em modelo ou enviá-los a um atleta, e definir o objetivo nutricional sem avisos.

## Imagens e vídeos dos exercícios
Os exercícios base têm 2 imagens (posição inicial/final) da [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (Unlicense, domínio público), guardadas em `public/exercises`; a ligação nome → imagens está em `scripts/exercise-media.json` e é aplicada por `npm run db:seed:system`. Qualquer exercício pode ter 1 imagem carregada (reduzida no telemóvel, guardada na BD com RLS e servida por `/api/exercise-image/[id]`) e um link de vídeo (YouTube embutido).

## Segurança
- Isolamento de dados por **RLS no Postgres**: cada pedido corre com `set local role authenticated` e `request.jwt.claim.sub` = utilizador (`withUser`). `withAdmin` só é usado em registo, sessões, tentativas de login e criação de contas de atleta pelo coach.
- Coach só vê dados de atletas com ligação ativa; correções do coach passam por funções auditadas.
- Autenticação própria: scrypt, cookie de sessão httpOnly, rate limiting, mudança de palavra-passe forçada para contas criadas por coach.
- O utilizador da `DATABASE_URL` tem de poder fazer `SET ROLE authenticated`.

## Scripts
`npm test` (vitest, 60 testes), `npm run test:e2e` (Playwright, 25 testes: os 15 fluxos, isolamento, modo atleta do coach e imagens/vídeos), `npm run typecheck`, `npm run build`.

## Limitações conhecidas
- Emails (convites, recuperação) só vão para log / `.outbox`; falta configurar um fornecedor.
- Registo de coach exige `COACH_SIGNUP_CODE`.
- Valores nutricionais base são aproximados (verificar licença/fonte INSA).
- Ainda por validar contra um Supabase real (`supabase db reset`).

## Fotos de progresso

Página **Fotos** (atleta e coach em "O meu treino"): regista fotos do corpo (frente, lado, costas) com data, peso e nota opcionais, vê a linha do tempo e compara duas datas com um slider "antes/depois". Depois de um treino aparece um convite para registar a foto do dia.

- Privadas por defeito. A RLS (migração `0010`) só deixa o dono ver/escrever; o coach ativo só vê as fotos marcadas como partilhadas pelo atleta (`/students/<id>/photos`).
- Guardadas na base de dados (reduzidas no telemóvel para ~1100 px + miniatura de 320 px), servidas por `/api/progress-photo/<id>` com `no-store` (nunca em cache). Apagar uma foto ou a conta elimina-as mesmo.
- Aplicar na produção: `npm.cmd run db:migrate`.

## Vários planos e calendário

- Podes ter **vários planos ativos** ao mesmo tempo ("no calendário"), por exemplo Push/Pull/Legs e UNC alternados.
- Em cada plano, o cartão **Calendário do plano** define a regularidade: todas as semanas, de 2/3/4 em 2/3/4 semanas, ou uma vez por mês (1.ª a 4.ª ou última semana do mês), com início e fim opcionais. Os dias da semana de cada treino definem-se nos dias do plano.
- Página **Calendário**: vista mensal com pontos coloridos por plano, detalhe do dia e botão para iniciar o treino. "Treino de hoje", "Próximo treino" e a adesão do coach respeitam a regularidade.
- Migração `0011`. Planos já ativos continuam a funcionar (todas as semanas).

## Atividades (padel, futebol…)

Página **Atividades** (a partir do Calendário): nome, dias da semana, hora e duração opcionais e a mesma regularidade dos planos. Aparecem no calendário (losango azul), em "Hoje" e marcam-se como feitas com um toque. Migração `0012`.

## Emails (registo, recuperação de palavra-passe, convites)

- Ao criar conta é enviado um email de **boas-vindas com link para confirmar o email**. A confirmação **não é obrigatória** (a conta funciona logo; o perfil mostra "Por confirmar" e permite reenviar, no máximo 1 vez de 5 em 5 minutos). Receber o link de recuperação de palavra-passe também confirma o email. Migração `0013`.
- Se o envio falhar, o registo e o resto da app **não são afetados** (o erro fica no log).
- Envio por **SMTP**, configurado com variáveis de ambiente (na Vercel: Settings → Environment Variables):

| Variável | Valor (exemplo Gmail) |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | o teu endereço Gmail |
| `SMTP_PASS` | palavra-passe de app (16 letras, sem espaços) |
| `MAIL_FROM` (opcional) | `Forma <o.teu@gmail.com>` |

Gmail: ativar a verificação em 2 passos → https://myaccount.google.com/apppasswords → criar uma palavra-passe de app. Para outro serviço (Brevo, etc.) só mudam estas variáveis. Sem `SMTP_*`, em desenvolvimento os emails ficam em `.outbox/mail.jsonl`; em produção não são enviados.
- `APP_URL` tem de ser o endereço público da app (os links dos emails usam-no).

## Fisioterapeuta e reabilitação

- **Conta de fisioterapeuta:** registo normal em `/register`, abrindo "Sou fisioterapeuta" e indicando o código `PHYSIO_SIGNUP_CODE` (variável de ambiente; vazio = desativado).
- **Pacientes:** o fisio convida pelo email da conta do paciente (Pacientes). O vínculo só fica ativo quando o paciente aceita (em Reabilitação ou no Perfil). O paciente pode terminá-lo a qualquer momento, e o fisio também.
- **Programas:** um programa é um grupo de exercícios (séries, repetições, tempo a manter, vezes por semana, indicações) para o paciente fazer quando lhe der jeito. Não há treinos, nutrição nem peso para o fisio.
- **Registos:** o paciente marca "feito" (com dor 0–10 e nota). O fisio vê o progresso da semana, a dor ao longo do tempo e os registos.
- **Privacidade:** o fisio só vê o nome do paciente e os programas/registos de reabilitação (RLS na base de dados; `physio_patients` é independente do vínculo coach↔atleta). Um coach pode continuar a ter o seu atleta que também é paciente.
- **Migrações:** 0014 (papel `physio`), 0015 (tabelas e políticas), 0016 (correção de política).
