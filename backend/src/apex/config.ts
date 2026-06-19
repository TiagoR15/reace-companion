export interface CircuitConfig {
  /** URL do WebSocket de live timing para este circuito. */
  wsUrl: string;
}

/**
 * Obtém a configuração do circuito a partir de
 * `https://live.apex-timing.com/<slug>/javascript/config.js`, que expõe as
 * variáveis globais `configHost` e `configPort`. O WebSocket de live timing
 * (HTTPS) está em `wss://{configHost}:{configPort + 3}/`.
 */
export async function getCircuitConfig(slug: string): Promise<CircuitConfig> {
  const url = `https://live.apex-timing.com/${slug}/javascript/config.js`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao obter config do circuito "${slug}": HTTP ${res.status}`);
  }
  const text = await res.text();

  const portMatch = text.match(/configPort\s*=\s*(\d+)/);
  const hostMatch = text.match(/configHost\s*=\s*'([^']+)'/);
  if (!portMatch || !hostMatch) {
    throw new Error(`Não foi possível extrair configHost/configPort para "${slug}".`);
  }

  const port = Number(portMatch[1]) + 3;
  const host = hostMatch[1];
  return { wsUrl: `wss://${host}:${port}/` };
}
