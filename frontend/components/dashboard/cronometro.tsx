"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiRequestError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { DISPLAY_RULES } from "@/lib/rules";
import { raceStateKey } from "@/hooks/useRaceState";
import type { RaceStateSnapshot, StintPlan } from "@/lib/types";

export function Cronometro({
  state,
  currentStint,
}: {
  state: RaceStateSnapshot;
  currentStint: StintPlan | undefined;
}) {
  const queryClient = useQueryClient();
  const { timer } = state;

  const startMutation = useMutation({
    mutationFn: () => api.post<RaceStateSnapshot>("/api/race/start"),
    onSuccess: (data) => queryClient.setQueryData(raceStateKey, data),
  });

  const pitMutation = useMutation({
    mutationFn: () => api.post<RaceStateSnapshot>("/api/race/pit"),
    onSuccess: (data) => queryClient.setQueryData(raceStateKey, data),
  });

  const raceDurationSec = state.config?.raceDurationSec ?? DISPLAY_RULES.raceDurationSec;
  const raceRemainingSec = Math.max(0, raceDurationSec - timer.elapsedRaceSec);
  const stintTargetSec = currentStint?.plannedDurationSec ?? DISPLAY_RULES.maxStintSec;
  const stintNearLimit = timer.elapsedStintSec >= stintTargetSec - 60;
  const error = startMutation.error ?? pitMutation.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cronómetro</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-sm">Tempo de corrida</div>
            <div className="font-mono text-3xl font-bold tabular-nums">
              {formatDuration(timer.elapsedRaceSec)}
            </div>
            <div className="text-muted-foreground text-xs">
              restam {formatDuration(raceRemainingSec)}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-sm">Piloto atual</div>
            <div className="text-xl font-semibold">
              {currentStint ? currentStint.driverName : "—"}
            </div>
            <div className="text-muted-foreground text-xs">
              stint {timer.currentStintIndex + 1}/{state.plan.length || DISPLAY_RULES.stintCount}
            </div>
          </div>

          {timer.sub === "inPit" ? (
            <div>
              <div className="text-muted-foreground text-sm">Pit (auto)</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-amber-600">
                {formatDuration(timer.pitRemainingSec)}
              </div>
              <div className="text-muted-foreground text-xs">próximo piloto arranca sozinho</div>
            </div>
          ) : (
            <div>
              <div className="text-muted-foreground text-sm">Tempo de stint</div>
              <div
                className={`font-mono text-3xl font-bold tabular-nums ${
                  stintNearLimit ? "text-red-600" : ""
                }`}
              >
                {formatDuration(timer.elapsedStintSec)}
              </div>
              <div className="text-muted-foreground text-xs">
                alvo {formatDuration(stintTargetSec)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {timer.phase === "idle" && (
            <Button size="lg" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              <Play className="h-4 w-4" />
              Começar corrida
            </Button>
          )}

          {timer.phase === "running" && timer.sub === "onTrack" && (
            <Button
              size="lg"
              variant="secondary"
              onClick={() => pitMutation.mutate()}
              disabled={pitMutation.isPending}
            >
              <Square className="h-4 w-4" />
              Entrada no pit
            </Button>
          )}

          {timer.phase === "running" && timer.sub === "inPit" && (
            <Button size="lg" variant="secondary" disabled>
              <Square className="h-4 w-4" />
              Em pit — a contar...
            </Button>
          )}

          {timer.phase === "finished" && (
            <div className="flex items-center gap-2 font-medium text-emerald-600">
              <Flag className="h-5 w-5" />
              Corrida terminada
            </div>
          )}

          <div className="text-muted-foreground text-sm">
            Paragens: <span className="font-medium">{timer.stopsDone}</span>/
            {DISPLAY_RULES.mandatoryStops}
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm">
            {error instanceof ApiRequestError ? error.message : "Erro ao comunicar com o servidor."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
