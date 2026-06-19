/** Piloto definido pelo utilizador na configuração da corrida. */
export interface Driver {
  /** Atribuído automaticamente pelo backend se não for indicado. */
  id?: string;
  name: string;
  /** Peso do piloto em kg (opcional, para sugestão de lastro — §10). */
  weightKg?: number;
  /** Tempo máximo de stint deste piloto, em segundos. Teto: 45min (regulamento). */
  maxStintSec?: number;
}

/** Configuração da corrida submetida no setup. */
export interface RaceConfig {
  /** Id/nº do kart da nossa equipa, usado para filtrar o feed da Apex Timing. */
  teamId: string;
  /** Slug do circuito na Apex Timing (ex: "kartodromodebaltar"). */
  circuitSlug: string;
  /** Duração total da prova, em segundos. Default: 7h. */
  raceDurationSec?: number;
  drivers: Driver[];
}

/** Um stint (turno) do plano de corrida, atribuído a um piloto. */
export interface StintPlan {
  index: number;
  driverId: string;
  driverName: string;
  plannedDurationSec: number;
}

/** Uma linha da tabela de cronograma (estilo Excel). */
export interface ScheduleRow {
  id: string;
  kind: "turno" | "box";
  label: string;
  stintIndex: number;
  driverId?: string;
  driverName?: string;
  targetSec: number;
  etaInMs: number;
  etaOutMs: number;
  actualSec?: number;
  actualOutMs?: number;
  deltaSec?: number;
  /** `true` se o `targetSec` foi definido manualmente pelo utilizador. */
  locked?: boolean;
}

/** Sugestão de lastro para um piloto abaixo do peso mínimo (§10). */
export interface BallastSuggestion {
  driverId: string;
  driverName: string;
  missingKg: number;
  weightsKg: number[];
}

export type TimerPhase = "idle" | "running" | "finished";
export type TimerSub = "onTrack" | "inPit";

/** Estado do cronómetro de corrida. */
export interface TimerState {
  phase: TimerPhase;
  sub: TimerSub;
  raceStartAt: number | null;
  currentStintIndex: number;
  stintStartedAt: number | null;
  pitEndsAt: number | null;
  stopsDone: number;
  elapsedRaceSec: number;
  elapsedStintSec: number;
  pitRemainingSec: number;
}

/** Um kart na grelha do live timing da Apex. */
export interface Kart {
  no: string;
  name: string;
  pos: number;
  lastLap?: string;
  bestLap?: string;
  gap?: string;
  laps?: string;
}

/** Snapshot normalizado do feed de live timing da Apex Timing. */
export interface LiveSnapshot {
  sessionType: string | null;
  karts: Kart[];
  updatedAt: number;
}

/** Estado completo da corrida devolvido pelo backend. */
export interface RaceStateSnapshot {
  config: RaceConfig | null;
  plan: StintPlan[];
  ballast: BallastSuggestion[];
  schedule: ScheduleRow[];
  timer: TimerState;
  live: LiveSnapshot | null;
  ourKart: Kart | null;
}

export interface ApiError {
  error: string;
}
