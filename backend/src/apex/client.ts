import { getCircuitConfig } from "./config.js";
import { ApexParser } from "./parser.js";
import type { LiveSnapshot } from "../types.js";

const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;

/**
 * Liga-se ao feed WebSocket de live timing da Apex Timing para um circuito,
 * faz o parse das mensagens e entrega snapshots normalizados via `onSnapshot`.
 * Reconecta automaticamente com backoff exponencial em caso de queda.
 */
export class ApexClient {
  private ws: WebSocket | null = null;
  private parser = new ApexParser();
  private reconnectDelayMs = INITIAL_RECONNECT_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly slug: string,
    private readonly onSnapshot: (snapshot: LiveSnapshot) => void,
  ) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      const { wsUrl } = await getCircuitConfig(this.slug);
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectDelayMs = INITIAL_RECONNECT_MS;
      };
      ws.onmessage = (event) => {
        const snapshot = this.parser.feed(String(event.data));
        this.onSnapshot(snapshot);
      };
      ws.onclose = () => this.scheduleReconnect();
      ws.onerror = () => {
        // onclose também é disparado a seguir; a reconexão é agendada aí.
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_MS);
  }
}
