"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { RaceStateSnapshot } from "@/lib/types";

export const raceStateKey = ["raceState"] as const;

/** Lê o estado atual da corrida (config, plano, cronómetro, live timing, ...). */
export function useRaceState() {
  return useQuery({
    queryKey: raceStateKey,
    queryFn: () => api.get<RaceStateSnapshot>("/api/race/state"),
    refetchInterval: false,
  });
}

/**
 * Subscreve `/api/stream` (SSE) e mantém o cache do react-query atualizado
 * com o snapshot completo do estado da corrida. Reconecta automaticamente.
 */
export function useLiveStream() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(`${api.apiUrl}/api/stream`);

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as RaceStateSnapshot;
        queryClient.setQueryData(raceStateKey, data);
      };

      source.onerror = () => {
        source?.close();
        reconnectTimeout = setTimeout(connect, 1000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [queryClient]);
}
