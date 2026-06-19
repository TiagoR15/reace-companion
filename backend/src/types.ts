/** Piloto definido pelo utilizador na configuração da corrida. */
export interface Driver {
  id: string;
  name: string;
  /** Peso do piloto em kg (opcional, para sugestão de lastro — §10). */
  weightKg?: number;
  /** Tempo máximo de stint deste piloto, em segundos. Teto: RULES.maxStintSec (45min). */
  maxStintSec?: number;
}

/** Configuração da corrida submetida no setup. */
export interface RaceConfig {
  /** Id/nº do kart da nossa equipa, usado para filtrar o feed da Apex Timing. */
  teamId: string;
  /** Slug do circuito na Apex Timing (ex: "kartodromodebaltar"). */
  circuitSlug: string;
  /** Duração total da prova, em segundos. Default: RULES.raceDurationSec (7h). */
  raceDurationSec?: number;
  drivers: Driver[];
}

/** Um stint (turno) do plano de corrida, atribuído a um piloto. */
export interface StintPlan {
  /** Índice do stint, 0-based (0..STINT_COUNT-1). */
  index: number;
  driverId: string;
  driverName: string;
  plannedDurationSec: number;
}

/** Uma linha da tabela de cronograma (estilo Excel "Barbosa Racing Team"). */
export interface ScheduleRow {
  /** Identificador único da linha, ex: "turno-1", "box-3". */
  id: string;
  kind: "turno" | "box";
  label: string;
  /** Índice do stint a que esta linha pertence (turnos e boxes partilham índice). */
  stintIndex: number;
  /** Id do piloto em pista (só linhas "turno"), editável pelo utilizador. */
  driverId?: string;
  /** Nome do piloto em pista (só linhas "turno"). */
  driverName?: string;
  /** Duração alvo desta fase, em segundos. */
  targetSec: number;
  /** Previsão de entrada (epoch ms), recalculada em cascata. */
  etaInMs: number;
  /** Previsão de saída (epoch ms), recalculada em cascata. */
  etaOutMs: number;
  /** Tempo real decorrido nesta fase, em segundos (preenchido pelo cronómetro). */
  actualSec?: number;
  /** Timestamp real de saída (epoch ms), quando a fase fecha. */
  actualOutMs?: number;
  /** Desvio (real - alvo), em segundos. */
  deltaSec?: number;
  /**
   * `true` se o `targetSec` foi definido manualmente pelo utilizador (e não
   * deve ser sobrescrito pela redistribuição automática em `rebalanceSchedule`).
   */
  locked?: boolean;
}

/** Sugestão de lastro para um piloto abaixo do peso mínimo (§10). */
export interface BallastSuggestion {
  driverId: string;
  driverName: string;
  /** Quanto falta para o peso mínimo (80kg), em kg. */
  missingKg: number;
  /** Combinação de lastros sugerida, em kg (ex: [10, 5, 2.5]). */
  weightsKg: number[];
}

/** Resultado do solver de distribuição: plano + cronograma + lastros. */
export interface StrategyResult {
  plan: StintPlan[];
  schedule: ScheduleRow[];
  ballast: BallastSuggestion[];
}

/** Erro de viabilidade devolvido pelo solver quando a configuração não é exequível. */
export interface StrategyError {
  error: string;
}

export type TimerPhase = "idle" | "running" | "finished";
export type TimerSub = "onTrack" | "inPit";

/** Estado do cronómetro de corrida, em memória no backend. */
export interface TimerState {
  phase: TimerPhase;
  sub: TimerSub;
  /** Timestamp (epoch ms) do início da corrida. */
  raceStartAt: number | null;
  /** Índice do stint atual (0-based). */
  currentStintIndex: number;
  /** Timestamp (epoch ms) do início do stint atual em pista. */
  stintStartedAt: number | null;
  /** Timestamp (epoch ms) em que a paragem atual termina (fim dos 4 min). */
  pitEndsAt: number | null;
  /** Nº de paragens já efetuadas. */
  stopsDone: number;
}

/** Um kart na grelha do live timing da Apex. */
export interface Kart {
  /** Nº do kart (coluna "no"), usado para identificar a nossa equipa. */
  no: string;
  /** Nome do piloto/equipa (coluna "dr"). */
  name: string;
  /** Posição na grelha. */
  pos: number;
  /** Última volta (coluna "llp"). */
  lastLap?: string;
  /** Melhor volta (coluna "blp"). */
  bestLap?: string;
  /** Diferença para o líder (coluna "gap"). */
  gap?: string;
  /** Nº de voltas (coluna "tlp"). */
  laps?: string;
}

/** Snapshot normalizado do feed de live timing da Apex Timing. */
export interface LiveSnapshot {
  sessionType: string | null;
  karts: Kart[];
  updatedAt: number;
}
