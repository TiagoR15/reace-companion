import { RULES, STINT_COUNT } from "./rules.js";
import type { ScheduleRow, TimerState } from "./types.js";

/** Estado inicial do cronómetro, antes de a corrida começar. */
export function createInitialTimerState(): TimerState {
  return {
    phase: "idle",
    sub: "onTrack",
    raceStartAt: null,
    currentStintIndex: 0,
    stintStartedAt: null,
    pitEndsAt: null,
    stopsDone: 0,
  };
}

/**
 * Botão ▶ Começar: arranca o cronómetro global da corrida (7h) e o timer do
 * 1º piloto (stint 0). Sem efeito se a corrida já tiver começado.
 */
export function startRace(timer: TimerState, now: number): TimerState {
  if (timer.phase !== "idle") return timer;
  return {
    ...timer,
    phase: "running",
    sub: "onTrack",
    raceStartAt: now,
    currentStintIndex: 0,
    stintStartedAt: now,
  };
}

/**
 * Botão 🅿 Entrada no pit: fecha o stint atual (regista o tempo real na linha
 * "turno-N" do cronograma) e inicia a contagem dos 4 min de pit mínimo (§8c).
 * O cronómetro global da corrida não é afetado — continua a correr (§8g).
 * Sem efeito se a corrida não estiver a decorrer ou já estiver em pit.
 */
export function pitIn(
  timer: TimerState,
  schedule: ScheduleRow[],
  now: number,
): { timer: TimerState; schedule: ScheduleRow[] } {
  if (
    timer.phase !== "running" ||
    timer.sub !== "onTrack" ||
    timer.stintStartedAt === null
  ) {
    return { timer, schedule };
  }

  const actualSec = Math.round((now - timer.stintStartedAt) / 1000);
  const turnoId = `turno-${timer.currentStintIndex + 1}`;
  const newSchedule = schedule.map((row) =>
    row.id === turnoId ? { ...row, actualSec, actualOutMs: now } : row,
  );

  const newTimer: TimerState = {
    ...timer,
    sub: "inPit",
    pitEndsAt: now + RULES.pitMinSec * 1000,
  };

  return { timer: newTimer, schedule: newSchedule };
}

/**
 * Avança o cronómetro até ao instante `now`. Quando os 4 min de pit terminam,
 * fecha a linha "box-N" do cronograma e arranca automaticamente o timer do
 * próximo piloto — sem necessitar de um segundo botão. Ao completar os 11
 * stints (10 paragens), a corrida passa a `finished`. Também marca `finished`
 * se o cronómetro global atingir as 7h.
 */
export function tick(
  timer: TimerState,
  schedule: ScheduleRow[],
  now: number,
  raceDurationSec: number = RULES.raceDurationSec,
  totalStints: number = STINT_COUNT,
): { timer: TimerState; schedule: ScheduleRow[] } {
  if (timer.phase !== "running") return { timer, schedule };

  if (timer.sub === "inPit" && timer.pitEndsAt !== null && now >= timer.pitEndsAt) {
    const pitEndsAt = timer.pitEndsAt;
    const boxId = `box-${timer.currentStintIndex + 1}`;
    const newSchedule = schedule.map((row) =>
      row.id === boxId
        ? { ...row, actualSec: RULES.pitMinSec, actualOutMs: pitEndsAt }
        : row,
    );

    const stopsDone = timer.stopsDone + 1;
    const nextStintIndex = timer.currentStintIndex + 1;

    if (nextStintIndex >= totalStints) {
      return {
        timer: { ...timer, phase: "finished", stopsDone, pitEndsAt: null },
        schedule: newSchedule,
      };
    }

    return {
      timer: {
        ...timer,
        sub: "onTrack",
        stopsDone,
        currentStintIndex: nextStintIndex,
        stintStartedAt: pitEndsAt,
        pitEndsAt: null,
      },
      schedule: newSchedule,
    };
  }

  if (
    timer.raceStartAt !== null &&
    now - timer.raceStartAt >= raceDurationSec * 1000
  ) {
    return { timer: { ...timer, phase: "finished" }, schedule };
  }

  return { timer, schedule };
}

/** Tempo decorrido desde o início da corrida (cronómetro global, 7h), em segundos. */
export function elapsedRaceSec(timer: TimerState, now: number): number {
  if (timer.raceStartAt === null) return 0;
  return Math.max(0, Math.floor((now - timer.raceStartAt) / 1000));
}

/** Tempo decorrido do stint atual (timer do piloto em pista), em segundos. */
export function elapsedStintSec(timer: TimerState, now: number): number {
  if (timer.stintStartedAt === null || timer.sub !== "onTrack") return 0;
  return Math.max(0, Math.floor((now - timer.stintStartedAt) / 1000));
}

/** Tempo restante da paragem atual (contagem decrescente dos 4 min), em segundos. */
export function pitRemainingSec(timer: TimerState, now: number): number {
  if (timer.pitEndsAt === null) return 0;
  return Math.max(0, Math.ceil((timer.pitEndsAt - now) / 1000));
}
