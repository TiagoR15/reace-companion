/** Constantes do Regulamento da Resistência 7H — Kartódromo de Baltar. */
export const RULES = {
  /** Duração total da corrida (§7a). */
  raceDurationSec: 7 * 3600,
  /** Paragens obrigatórias (§8a) → 11 stints. */
  mandatoryStops: 10,
  /** Turno máximo de condução (§8a). */
  maxStintSec: 45 * 60,
  /** Duração mínima da paragem na box (§8c). */
  pitMinSec: 4 * 60,
  /** Treino cronometrado (§7a). */
  qualiDurationSec: 20 * 60,
  /** Nº de pilotos por equipa (§2a). */
  minDrivers: 2,
  maxDrivers: 7,
  /** Peso mínimo do piloto, sem o kart (§10). */
  minDriverWeightKg: 80,
  /** Lastros disponíveis, em kg (§10). */
  ballastWeightsKg: [10, 5, 2.5] as const,
  /** Duração mínima da penalização STOP&GO (§12c). */
  stopAndGoSec: 60,
} as const;

/** Número de stints (turnos) da corrida: paragens obrigatórias + 1. */
export const STINT_COUNT = RULES.mandatoryStops + 1;

/**
 * Tempo total efetivo de pista (duração da prova menos as paragens
 * obrigatórias), dada a duração da prova em segundos.
 */
export function greenTimeSec(raceDurationSec: number): number {
  return raceDurationSec - RULES.mandatoryStops * RULES.pitMinSec;
}

/** Tempo total efetivo de pista para a duração de prova por defeito (7h). */
export const GREEN_TIME_SEC = greenTimeSec(RULES.raceDurationSec);
