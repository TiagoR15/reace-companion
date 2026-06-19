import { ApexClient } from "./client.js";
import { raceState } from "../state.js";

let current: { slug: string; client: ApexClient } | null = null;

/**
 * Garante que há um `ApexClient` ligado ao circuito `slug`, ligando os
 * snapshots ao estado da corrida. Reinicia a ligação se o slug mudar.
 */
export function ensureApexClient(slug: string): void {
  if (current && current.slug === slug) return;

  current?.client.stop();
  const client = new ApexClient(slug, (snapshot) => raceState.setLive(snapshot));
  client.start();
  current = { slug, client };
}
