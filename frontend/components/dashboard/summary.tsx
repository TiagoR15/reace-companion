"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { DISPLAY_RULES } from "@/lib/rules";
import type { RaceStateSnapshot } from "@/lib/types";

export function Summary({ state }: { state: RaceStateSnapshot }) {
  const { timer, ourKart, ballast } = state;
  const remainingSec = Math.max(0, DISPLAY_RULES.raceDurationSec - timer.elapsedRaceSec);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Decorrido</div>
            <div className="font-medium tabular-nums">{formatDuration(timer.elapsedRaceSec)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Restante</div>
            <div className="font-medium tabular-nums">{formatDuration(remainingSec)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Posição</div>
            <div className="font-medium tabular-nums">{ourKart?.pos ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Voltas</div>
            <div className="font-medium tabular-nums">{ourKart?.laps ?? "—"}</div>
          </div>
        </div>

        {ballast.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-2 text-sm">Sugestão de lastro (§10)</div>
            <div className="flex flex-col gap-2">
              {ballast.map((b) => (
                <div key={b.driverId} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{b.driverName}</span>
                  <span className="text-muted-foreground">faltam {b.missingKg}kg —</span>
                  {b.weightsKg.map((w, i) => (
                    <Badge key={i} variant="secondary">
                      {w}kg
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
