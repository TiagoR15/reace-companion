/** Constantes do regulamento, para apresentação read-only no setup. */
export const DISPLAY_RULES = {
  raceDurationHours: 7,
  raceDurationSec: 7 * 3600,
  mandatoryStops: 10,
  stintCount: 11,
  maxStintMin: 45,
  maxStintSec: 45 * 60,
  pitMinMin: 4,
  minDrivers: 2,
  maxDrivers: 7,
} as const;
