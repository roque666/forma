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
