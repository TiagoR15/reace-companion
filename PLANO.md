# Plano: raceCompanion — Gestão de estratégia para corrida de resistência de karts

## Contexto

App para ajudar a gestão de uma corrida de **resistência (enduro) de karts** de uma equipa com
X pilotos. O user indica **quantos pilotos** vão correr (e o máximo de cada um); o backend calcula
a **melhor distribuição de stints para ganhar**. A app é conduzida por um **cronómetro com botões**
(arranque da corrida e entrada no pit), regista os tempos reais de cada piloto numa **tabela
dinâmica** (estilo o Excel "Barbosa Racing Team") e mostra o live timing da **Apex Timing** filtrado
pela nossa equipa.

A prova-alvo é a **Resistência de 7H do Kartódromo de Baltar**. Muitas das variáveis que o plano
original assumia como "configuráveis" são, na verdade, **impostas pelo regulamento** (ver secção
seguinte) e passam a ser **constantes/restrições rígidas** do motor de estratégia.

Decisões já validadas com o utilizador:
- **Formato:** corrida de **duração fixa** (7h). Vence quem completar mais voltas no menor tempo.
- **Input principal:** **nº de pilotos** + **tempo máximo de stint por piloto** (teto regulamentar
  45 min). O backend calcula a distribuição ótima dos 11 stints.
- **Identificação da equipa:** pelo **número/id da equipa** (kart) — o user introduz o id e o feed
  é **filtrado por esse id** (coluna `no`), não por nome.
- **Controlo por cronómetro:** a corrida é guiada por **botões** (▶ começar, 🅿 entrada no pit), não
  por deteção automática no feed. Ao carregar no pit conta-se o pit mínimo (4 min) e, **no fim desses
  4 min, o timer do próximo piloto arranca automaticamente** (sem segundo botão).
- **Sem autenticação. Sem base de dados** (estado em memória, por agora).

### Fonte de dados em tempo real (já investigada)

O feed da Apex Timing é um **WebSocket não autenticado** que empurra os tempos (o regulamento §9
confirma a cronometragem **APEX-TIMING**):
- A página `https://live.apex-timing.com/<slug>/javascript/config.js` expõe `configPort` e
  `configHost`. Para Baltar: `configPort=9800`, `configHost='live-data.apex-timing.com'`.
- URL do WebSocket: HTTPS → `wss://{configHost}:{configPort+3}/` (Baltar = `wss://live-data.apex-timing.com:9803/`).
- O servidor (`TooTallNate Java-WebSocket`) começa a empurrar dados ao ligar; o cliente **não envia subscrição**.
- Protocolo: linhas `campo|chave|valor` separadas por `\n`. Comandos: `init|r|`/`init|p|`/`init|n|`
  (tipo de sessão), `grid||<HTML tbody>` (grelha inicial), `<rNcM>|*|<valor>` (update de célula),
  `css|classe|regras`, `title1/title2/track/light/wthN/dyn1/dyn2/gmt` (cabeçalho/estado).
  Colunas da grelha por `data-type`: `no` (kart), `dr` (piloto/equipa), `llp` (última volta),
  `blp` (melhor volta), `gap` (diferença), `tlp` (nº voltas).
- **Ressalva:** protocolo interno não oficial — pode mudar sem aviso; a porta é específica do circuito.

## Regras da prova (Regulamento Resistência 7H — Baltar)

Restrições **rígidas** que o motor de estratégia tem de respeitar:

| Regra | Valor | §  | Impacto na app |
|---|---|---|---|
| Duração da corrida | **7h** (10:30 → 17:30) | §4, §7a | `raceDurationSec = 25200` fixo |
| Paragens obrigatórias | **10** (⇒ **11 turnos**) | §8a | `mandatoryStops = 10` fixo, **não configurável** |
| Turno **máximo** de condução | **45 min** | §8a | Teto rígido por stint; o user pode pôr um máx **menor por piloto** (≤ 45) |
| Pit (BOX) **mínimo** | **4 min** | §8c | `pitMinSec = 240`; ao carregar no pit, conta 4 min e arranca o próximo piloto |
| Tempo de paragem | conta como **tempo de prova** | §8g | O relógio não pára nas boxes |
| Troca de kart | **obrigatória em cada BOX** (kart por sorteio) | §8a | Performance pode variar entre stints; usar volta média recente, não global |
| Troca de piloto | **não** obrigatória por paragem | §8e | Um piloto pode encadear stints (respeitando os 45 min por turno) |
| Turno/tempo mínimo de piloto | **não existe** | §8f | Sem piso de tempo por piloto… |
| Participação | **todos os pilotos têm de conduzir** ≥ 1 turno | §8f | Restrição de atribuição: cada piloto ≥ 1 stint |
| Nº de pilotos | **2 a 7** | §2a | Validar `2 ≤ driverCount ≤ 7` |
| Idade mínima | 16 anos | §2c | (informativo) |
| Peso mínimo | **piloto 80 kg** + peso do kart, sem tolerância; lastros 2,5/5/10 kg | §10 | Campo de peso por piloto → sugerir lastro; **balança em cada BOX** (§8d) |
| Treino cronometrado (quali) | **20 min**, 10:00–10:20; partic. não obrigatória de todos | §7a/b | Sessão de quali define a grelha (ver cronograma) |
| Desempate na quali | 2ª volta mais rápida | §7e | (informativo) |
| Kart da quali = kart do início | sem troca, sem reabastecimento entre quali e corrida | §7h/i | 1º stint herda o kart da quali |
| Partida | tipo **"Le Mans"** | §7c | (informativo p/ o cronograma) |
| Penalizações | **STOP&GO** (mín. **60 s**) e/ou voltas | §12 | Mostrar alerta quando o feed indicar penalização |
| Bandeira vermelha / 75% | corrida em mangas; ≥75% pode dar-se por terminada | §11 | Edge case (fora do MVP) |
| Cronometragem | sistema **APEX-TIMING**; transponder por equipa | §9 | Feed filtrado pelo **id/nº do kart** da nossa equipa |

## Fluxo do cronómetro e botões (o coração da app)

A corrida é conduzida por um **cronómetro do lado do servidor** com dois botões. O estado vive no
backend (para sobreviver a refreshes do browser) e é empurrado por SSE.

**Dois cronómetros distintos:**
- **Cronómetro global da corrida** (7h) — arranca em **▶ Começar** e **nunca pára**, nem durante o
  pit (o tempo de pit conta como tempo de prova, §8g). Só termina às 7h ou no fim da prova.
- **Timer do stint do piloto** — mede só o tempo do piloto atual em pista; reinicia a cada novo stint.

**Estados:** `idle → running → finished`. Sub-estado durante `running`: `onTrack` (piloto em pista)
ou `inPit` (a contar os 4 min). Em **ambos** os sub-estados o cronómetro global continua a correr.

1. **▶ Começar** — marca `raceStartAt = now`, arranca o cronómetro global (7h) **e** o timer do
   **1º piloto** (stint 1). Estado → `running / onTrack`.
2. **🅿 Entrada no pit** (só visível em `onTrack`) — ao carregar:
   - **fecha o stint atual**: regista na tabela o `tempoReal` do piloto (now − início do stint);
   - estado → `inPit`, arranca a **contagem decrescente de 4 min** (pit mínimo, §8c);
   - **quando os 4 min terminam**, **automaticamente** (sem segundo botão) estado → `onTrack` e
     **arranca o timer do próximo piloto** (próximo stint da distribuição). Incrementa o contador de
     paragens (×/10).
3. Repete até às **10 paragens / 11 stints** ou até o cronómetro global chegar a 7h → `finished`.

Notas: o pit conta como tempo de prova (§8g), por isso o cronómetro global **nunca pára**. Se um
piloto exceder o seu máximo configurado antes de o user carregar no pit, mostra-se um **alerta**
(não bloqueia — a decisão é humana). O tempo real de cada stint é o que efetivamente decorreu entre
o arranque do stint e o carregar do botão de pit — é isso que se regista, não o alvo.

## Cronograma / tabela de tempos (a "tabela igual" ao Excel)

O Excel de referência (`Plano_Corrida_Dinamico_Com_Qualificacao.xlsx`, "Barbosa Racing Team") é um
**cronograma em cascata**: cada fase (turno / box) tem um **alvo**; quando se regista o **tempo real**
de uma fase, as previsões seguintes deslizam e a coluna **Delta** mostra o desvio (real − alvo). A
app **reproduz esta tabela**, mas o **tempo real é preenchido automaticamente pelos eventos do
cronómetro** (botões ▶/🅿), não escrito à mão nem inferido do feed.

**Colunas da tabela** (espelham o Excel):

| Fase da Prova | Piloto em Pista | Alvo (min) | Previsão Entrada | Previsão Saída | Saída Real | Tempo Real | Delta |
|---|---|---|---|---|---|---|---|

Estrutura das linhas (início 10:30):
- **Turno 1 … Turno 11** intercalados com **BOX 1 … BOX 10** (10 boxes = 10 paragens obrigatórias).
- Cada `Turno` tem `Alvo (min)` = duração planeada pela distribuição (≤ máx do piloto, ≤ 45);
  cada `BOX` tem `Alvo = 4 min`.
- (Opcional) linha(s) de **Quali** no topo, como no Excel — fora do MVP do cronómetro.
- Linha final **Total Delta** = adianto/atraso acumulado face ao plano.

Lógica de cascata (igual ao Excel, replicada no backend):
- `previsãoEntrada(linha) = saídaReal(linha-1)` se já houver, senão `previsãoSaída(linha-1)`.
- `previsãoSaída(linha) = previsãoEntrada(linha) + alvo`.
- `delta(linha) = tempoReal − alvo` (preenchido quando o botão fecha a fase).
- Recalcular tudo a jusante a cada novo tempo real registado pelos botões.

## Arquitetura

```
Apex Timing WS  ──►  Backend Node (parser + estado + estratégia + cronograma)  ──►  Frontend Next.js
 (wss :9803)         REST (config) + SSE (push ao vivo)                              (react-query + EventSource)
```

O **backend** mantém a ligação WebSocket longa à Apex (algo que as serverless API routes do
Next.js não fazem bem), faz o parse do protocolo, normaliza a grelha, calcula a estratégia e o
cronograma, e empurra tudo para o frontend via **SSE**. O frontend só consome.

## Estrutura do repositório

```
raceCompanion/
├── backend/                 # Node + TypeScript (Fastify)
│   ├── src/
│   │   ├── index.ts             # bootstrap servidor + arranque do ApexClient
│   │   ├── apex/
│   │   │   ├── client.ts        # liga ao WS, reconexão automática
│   │   │   ├── parser.ts        # parse linhas campo|chave|valor + grelha (cheerio)
│   │   │   └── config.ts        # fetch /<slug>/javascript/config.js → {host, port}
│   │   ├── state.ts             # store singleton em memória (config + live + timer + cronograma)
│   │   ├── strategy.ts          # solver da distribuição + cronograma em cascata (funções puras)
│   │   ├── timer.ts             # máquina de estados do cronómetro (start/pit/auto-advance)
│   │   ├── rules.ts             # constantes do regulamento (7h, 10 paragens, 45min, 4min, …)
│   │   ├── routes/
│   │   │   ├── race.ts          # POST /api/race/config, GET /api/race/state
│   │   │   ├── timer.ts         # POST /api/race/start, POST /api/race/pit
│   │   │   └── live.ts          # GET /api/live, GET /api/stream (SSE)
│   │   └── types.ts             # tipos partilhados (Kart, RaceConfig, StintPlan, ScheduleRow, ...)
│   └── package.json
├── frontend/                # Next.js (App Router) + Tailwind + shadcn
│   ├── app/
│   │   ├── page.tsx             # /  → setup da corrida
│   │   └── dashboard/page.tsx   # /dashboard → live timing + estratégia + cronograma
│   ├── components/              # shadcn (button, card, input, table, form, badge, ...)
│   ├── lib/
│   │   ├── api.ts               # cliente REST (fetch para o backend)
│   │   └── types.ts             # tipos espelhados do backend
│   ├── hooks/
│   │   ├── useRaceConfig.ts     # react-query: GET/POST config
│   │   └── useLiveStream.ts     # EventSource (SSE) → atualiza cache do react-query
│   └── package.json
└── README.md
```

## Backend — implementação

### 0. Constantes do regulamento (`rules.ts`)
Centraliza os valores fixos da prova (e evita "números mágicos" espalhados):
```ts
export const RULES = {
  raceDurationSec: 7 * 3600,   // 7h (§7a)
  mandatoryStops: 10,          // §8a  → 11 stints
  maxStintSec: 45 * 60,        // turno máximo (§8a)
  pitMinSec: 4 * 60,           // box mínima (§8c)
  qualiDurationSec: 20 * 60,   // treino cronometrado (§7a)
  minDrivers: 2, maxDrivers: 7,// §2a
  minDriverWeightKg: 80,       // §10  (piloto, sem o kart)
  stopAndGoSec: 60,            // §12c
} as const;
```

### 1. ApexClient (`apex/client.ts` + `apex/parser.ts` + `apex/config.ts`)
- `getCircuitConfig(slug)`: fetch a `https://live.apex-timing.com/<slug>/javascript/config.js`,
  extrai `configPort`/`configHost` por regex → devolve `wss://{host}:{port+3}/`.
- `ApexClient`: abre `WebSocket` (nativo do Node 22); `onmessage` → `parser`. Reconexão com backoff.
- `parser.ts`: divide por `\n` e `|`; mantém modelo normalizado da grelha:
  - `grid||<html>` → parse com **cheerio**; mapa `rowId → { kart, name, lastLap, bestLap, gap, laps, pos }`.
  - `<rNcM>|*|<valor>` → update incremental da célula (mapear `cM`→campo via cabeçalho).
  - `init|...` → reset/tipo de sessão; `title*/track/light` → metadados.
- Resultado: snapshot `LiveSnapshot = { sessionType, karts: Kart[], updatedAt }`. A cada mudança,
  `state.setLive(snapshot)` → evento SSE.
- **Papel do feed:** é só para **mostrar o live timing** (posição, voltas, gaps) da nossa equipa e
  rivais. O avanço de stints/boxes é controlado pelos **botões do cronómetro**, não pelo feed. Como
  bónus opcional, o feed pode **validar** a contagem de voltas do nosso kart, mas não é o gatilho.

### 2. Estado em memória (`state.ts`)
Singleton com:
- `raceConfig: RaceConfig | null` — `{ teamId, circuitSlug, drivers: Driver[], startAt }`
  (a duração, nº de paragens, etc. vêm de `RULES`, não da config).
  `Driver = { name, weightKg?, maxStintSec? }` (`maxStintSec` default/teto = `RULES.maxStintSec`).
- `plan: StintPlan[]` (distribuição calculada), `timer: TimerState`, `schedule: ScheduleRow[]`.
- `live: LiveSnapshot | null` (só display).
- `EventEmitter` para notificar os clientes SSE.
- **Identificação da equipa pelo id:** o `ourKart` é a row cujo `no` (nº do kart) === `raceConfig.teamId`.

`TimerState = { phase: 'idle'|'running'|'finished', sub: 'onTrack'|'inPit', raceStartAt?: epochMs,
currentStintIndex, currentDriver, stintStartedAt?: epochMs, pitEndsAt?: epochMs, stopsDone }`.

### 3. Solver de distribuição + cronograma (`strategy.ts`) — funções puras
Calcula a **melhor distribuição para ganhar** dado o nº de pilotos e o máximo de cada um.
- `stints = RULES.mandatoryStops + 1` (**= 11**, fixo).
- `greenTimeSec = RULES.raceDurationSec − RULES.mandatoryStops * RULES.pitMinSec` (≈ 380 min de pista).
- **Objetivo:** maximizar voltas ⇒ usar **todo** o `greenTimeSec` e dar mais tempo aos pilotos mais
  rápidos (se houver `avgLap`/melhor volta por piloto; senão, repartição equilibrada).
- **Restrições:** cada stint ≤ `min(driver.maxStintSec, RULES.maxStintSec)`; **cada piloto ≥ 1 stint**
  (§8f — participação obrigatória); soma dos 11 stints = `greenTimeSec`.
  Verificar **viabilidade**: `11 * 45min ≥ greenTimeSec` (sempre ok) e `Σ maxStint dos pilotos`
  (com nº de stints possíveis) chega para cobrir `greenTimeSec` — senão devolver erro ao user.
- Produz `StintPlan[]` `{ index, driver, plannedDurationSec, expectedLaps }` e o `ScheduleRow[]`
  do cronograma (turnos + boxes, com `targetMin`, `etaIn`, `etaOut`).
- **Cascata:** dado o `plan` + os **tempos reais** registados pelo cronómetro, recalcula `etaIn/etaOut`
  e `delta` de cada linha a jusante (lógica do Excel).
- **Peso:** por cada `driver.weightKg < 80`, sugerir lastro combinando 2,5/5/10 kg (§10).
- Tudo testável isoladamente (sem I/O).

### 4. Cronómetro (`timer.ts`) — máquina de estados
Funções que mutam `TimerState` e devolvem o novo estado + linhas de cronograma fechadas:
- `start()` (`idle`→`running/onTrack`): `raceStartAt = now`, `currentStintIndex = 0`,
  `currentDriver = plan[0].driver`, `stintStartedAt = now`.
- `pitIn()` (`onTrack`→`inPit`): fecha o stint atual → grava `tempoReal = now − stintStartedAt`
  na `ScheduleRow` do turno; `pitEndsAt = now + RULES.pitMinSec`; `stopsDone++`.
- **auto-advance** (`inPit`→`onTrack`, disparado por um `setTimeout`/tick quando `now ≥ pitEndsAt`):
  fecha a linha BOX (sempre 4 min), avança `currentStintIndex`, `currentDriver = plan[i].driver`,
  `stintStartedAt = now`. Se já foram 10 paragens / 11 stints → `finished`.
- Tick periódico (1 s) recalcula contadores (decrescente do pit, decrescente até 45 min do stint
  atual) e emite SSE. Tudo derivado de timestamps absolutos → resistente a refresh.

### 5. API (`routes/`) — Fastify
- `POST /api/race/config` → valida (`2 ≤ drivers ≤ 7`, `teamId`), corre o solver, grava `plan` +
  `schedule`, (re)inicia o `ApexClient` no `circuitSlug`. Devolve estado + plano inicial.
- `POST /api/race/start` → `timer.start()`.
- `POST /api/race/pit` → `timer.pitIn()` (o auto-advance acontece sozinho ao fim dos 4 min).
- `GET /api/race/state` → `{ config, plan, timer, schedule, ourKart }`.
- `GET /api/live` → último `LiveSnapshot`. `GET /api/stream` (**SSE**) → emite `live`, `timer`,
  `schedule` em cada tick/evento. CORS aberto (sem auth).

## Frontend — implementação

### Setup (`app/page.tsx`)
Form com shadcn: **id/nº da equipa** (kart) para filtrar o feed, **nº de pilotos** (2–7) e, por
piloto, **nome**, **peso (kg)** e **tempo máximo de stint** (default 45 min, não pode exceder 45).
Opcional: **slug do circuito** (default `kartodromodebaltar`). A duração (7h), nº de paragens (10) e
pit mínimo (4 min) aparecem **read-only** (constantes do regulamento). Submit → `POST /api/race/config`
(corre o solver e mostra a distribuição calculada) → `/dashboard`.

### Dashboard (`app/dashboard/page.tsx`)
- **`useLiveStream`**: `EventSource` para `/api/stream`; escreve no cache do react-query
  (`live`, `timer`, `schedule`). Reconexão automática.
- Painéis (shadcn `card`/`table`/`badge`):
  1. **Cronómetro** (topo, grande) — relógio da corrida + botões:
     - **▶ Começar corrida** (estado `idle`);
     - **🅿 Entrada no pit** (estado `onTrack`) → mostra logo a **contagem decrescente dos 4 min**
       e, no fim, troca sozinho para o próximo piloto;
     - **piloto atual** + tempo do stint a subir, com aviso a vermelho quando se aproxima do seu máximo;
     - paragens feitas **×/10**.
  2. **Tabela de tempos (igual ao Excel)** — Fase | Piloto | Alvo | Prev. Entrada | Prev. Saída |
     Saída Real | Tempo Real | Delta. Linha atual destacada; deltas a verde (adianto) / vermelho
     (atraso); total no fundo. **Tempos reais preenchidos automaticamente pelos botões**.
  3. **Live timing** — tabela dos karts vindos do feed (pos, kart, equipa, última, melhor, gap,
     voltas), com a **nossa equipa (id) destacada** (lucide `Flag`/`Star`).
  4. **Resumo** — voltas projetadas, tempo decorrido/restante, posição atual, sugestão de lastro.

### Infra frontend
- `lib/api.ts`: wrapper `fetch` com base URL do backend (env `NEXT_PUBLIC_API_URL`).
- `QueryClientProvider` no `app/layout.tsx`.
- shadcn init (`components.json`) + Tailwind; `lucide-react` vem com shadcn.
- O cronómetro renderiza-se a partir de timestamps do backend (não guarda tempo no cliente), por
  isso um refresh ou reabrir o browser **retoma** o estado correto.

## Dependências
- **Backend:** `fastify`, `@fastify/cors`, `cheerio`, `tsx`/`typescript`, `vitest`.
- **Frontend:** `next`, `react`, `tailwindcss`, `@tanstack/react-query`, shadcn (CLI) + `lucide-react`,
  `react-hook-form` + `zod`.

## Passos de implementação (ordem sugerida)
1. Scaffold `backend/` (Fastify + TS) e `frontend/` (`create-next-app` + Tailwind + shadcn init).
2. Backend: `rules.ts` + `strategy.ts` (solver da distribuição + cascata) **com testes vitest**.
3. Backend: `timer.ts` (máquina de estados start/pit/auto-advance) **com testes vitest** + `state.ts`.
4. Backend: rotas REST (`config`, `start`, `pit`, `state`) + SSE; `apex/*` para o live timing por id.
5. Frontend: setup (id da equipa + pilotos com peso e máx) + mutation de config (mostra distribuição).
6. Frontend: dashboard — **cronómetro + botões ▶/🅿** ligados ao SSE, e a **tabela de tempos**.
7. Frontend: live timing (feed filtrado pelo id) + resumo; polir (deltas coloridos, avisos, refresh).

## Verificação
- **Solver:** testes vitest — N pilotos + máximos por piloto → 11 stints, **nenhum > min(máx,45)**,
  **cada piloto ≥ 1 stint**, soma = `greenTimeSec`; caso inviável (máximos baixos demais) → erro.
- **Cronómetro:** testes da máquina de estados — `start`→`pitIn`→(4 min)→auto-advance; verificar
  que o tempo real do stint é gravado, paragens incrementam e ao 11º stint vai a `finished`.
- **Cascata:** registar um tempo real → `etaIn/etaOut`/`delta` a jusante deslizam (como no Excel).
- **End-to-end:** arrancar backend + `next dev`; setup com um `teamId` existente no feed ao vivo;
  carregar ▶ e 🅿 e confirmar: tabela a preencher tempos reais, troca automática de piloto ao fim dos
  4 min, e a nossa equipa (id) destacada no live timing.

## Fora de âmbito (futuro)
- Base de dados (persistência/histórico) e autenticação — adiados.
- Interrupção por bandeira vermelha / regra dos 75% / mangas (§11).
- Otimização avançada de undercut/overcut e modelação da variação de performance entre karts.
- Multi-equipa / multi-utilizador.
