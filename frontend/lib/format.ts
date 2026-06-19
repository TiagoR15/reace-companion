/** Formata segundos como mm:ss (ou hh:mm:ss se >= 1h). */
export function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;

  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

/** Formata um timestamp epoch ms como hora local hh:mm:ss (formato 24h, fixo). */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Formata um delta em segundos com sinal, ex: "+12s" / "-5s". */
export function formatDelta(deltaSec: number): string {
  const sign = deltaSec > 0 ? "+" : "";
  return `${sign}${Math.round(deltaSec)}s`;
}
