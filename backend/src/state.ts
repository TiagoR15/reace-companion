import { EventEmitter } from "node:events";
import { RULES } from "./rules.js";
import {
  applyScheduleEdit,
  computeStrategy,
  rebalanceSchedule,
  recalculateSchedule,
  syncPlanWithSchedule,
  type ScheduleEdit,
} from "./strategy.js";
import {
  createInitialTimerState,
  elapsedRaceSec,
  elapsedStintSec,
  pitIn,
  pitRemainingSec,
  startRace,
  tick,
} from "./timer.js";
import type {
  BallastSuggestion,
  Kart,
  LiveSnapshot,
  RaceConfig,
  ScheduleRow,
  StintPlan,
  StrategyError,
  StrategyResult,
  TimerState,
} from "./types.js";

export interface RaceStateSnapshot {
  config: RaceConfig | null;
  plan: StintPlan[];
  ballast: BallastSuggestion[];
  schedule: ScheduleRow[];
  timer: TimerState & {
    elapsedRaceSec: number;
    elapsedStintSec: number;
    pitRemainingSec: number;
  };
  live: LiveSnapshot | null;
  ourKart: Kart | null;
}

/**
 * Estado singleton em memória da corrida: configuração, plano/cronograma,
 * cronómetro e o último snapshot do live timing. Emite `"update"` (com o
 * snapshot completo) sempre que algo muda, para os clientes SSE.
 */
class RaceState extends EventEmitter {
  private config: RaceConfig | null = null;
  private plan: StintPlan[] = [];
  private schedule: ScheduleRow[] = [];
  private ballast: BallastSuggestion[] = [];
  private timer: TimerState = createInitialTimerState();
  private live: LiveSnapshot | null = null;
  private tickHandle: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.tickHandle = setInterval(() => this.onTick(), 1000);
  }

  /** Grava a configuração e (re)calcula o plano de stints + cronograma. */
  setConfig(config: RaceConfig): StrategyResult | StrategyError {
    const result = computeStrategy(config);
    if ("error" in result) return result;

    this.config = config;
    this.plan = result.plan;
    this.schedule = result.schedule;
    this.ballast = result.ballast;
    this.timer = createInitialTimerState();
    this.emitUpdate();
    return result;
  }

  /** Botão ▶ Começar. */
  start(): TimerState {
    const now = Date.now();
    this.timer = startRace(this.timer, now);
    this.schedule = recalculateSchedule(this.schedule, this.timer.raceStartAt ?? now);
    this.emitUpdate();
    return this.timer;
  }

  /** Botão 🅿 Entrada no pit. */
  pit(): TimerState {
    const now = Date.now();
    const result = pitIn(this.timer, this.schedule, now);
    this.timer = result.timer;

    // O turno que terminou agora tem `actualSec`/`deltaSec` conhecidos:
    // redistribui o tempo alvo dos turnos pendentes para absorver esse
    // desvio (positivo ou negativo) e mantém o plano em sincronia.
    const raceDurationSec = this.config?.raceDurationSec ?? RULES.raceDurationSec;
    const rebalanced = rebalanceSchedule(result.schedule, this.config?.drivers ?? [], raceDurationSec);
    this.plan = syncPlanWithSchedule(this.plan, rebalanced);
    this.schedule = recalculateSchedule(rebalanced, this.timer.raceStartAt ?? now);
    this.emitUpdate();
    return this.timer;
  }

  /** Atualiza o último snapshot do live timing da Apex. */
  setLive(snapshot: LiveSnapshot) {
    this.live = snapshot;
    this.emitUpdate();
  }

  getOurKart(): Kart | null {
    if (!this.config || !this.live) return null;
    return this.live.karts.find((k) => k.no === this.config!.teamId) ?? null;
  }

  getState(): RaceStateSnapshot {
    const now = Date.now();
    return {
      config: this.config,
      plan: this.plan,
      ballast: this.ballast,
      schedule: this.schedule,
      timer: {
        ...this.timer,
        elapsedRaceSec: elapsedRaceSec(this.timer, now),
        elapsedStintSec: elapsedStintSec(this.timer, now),
        pitRemainingSec: pitRemainingSec(this.timer, now),
      },
      live: this.live,
      ourKart: this.getOurKart(),
    };
  }

  /** Edita o piloto e/ou o tempo alvo de um turno ainda não concluído. */
  editScheduleRow(rowId: string, edit: ScheduleEdit): RaceStateSnapshot | StrategyError {
    if (!this.config) {
      return { error: "Configura a corrida antes de editar o cronograma." };
    }

    const result = applyScheduleEdit(this.schedule, this.plan, this.config.drivers, rowId, edit);
    if ("error" in result) return result;

    const raceDurationSec = this.config.raceDurationSec ?? RULES.raceDurationSec;
    const rebalanced = rebalanceSchedule(result.schedule, this.config.drivers, raceDurationSec);
    this.plan = syncPlanWithSchedule(result.plan, rebalanced);
    this.schedule = recalculateSchedule(rebalanced, this.timer.raceStartAt ?? 0);
    this.emitUpdate();
    return this.getState();
  }

  private onTick() {
    if (this.timer.phase !== "running") return;
    const now = Date.now();
    const raceDurationSec = this.config?.raceDurationSec ?? RULES.raceDurationSec;
    const result = tick(this.timer, this.schedule, now, raceDurationSec, this.plan.length);
    this.timer = result.timer;
    this.schedule = recalculateSchedule(result.schedule, this.timer.raceStartAt ?? now);
    this.emitUpdate();
  }

  private emitUpdate() {
    this.emit("update", this.getState());
  }
}

export const raceState = new RaceState();
