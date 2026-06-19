"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiRequestError } from "@/lib/api";
import { formatClock, formatDelta, formatDuration } from "@/lib/format";
import { raceStateKey } from "@/hooks/useRaceState";
import type { RaceStateSnapshot } from "@/lib/types";

export function ScheduleTable({ state }: { state: RaceStateSnapshot }) {
  const { schedule, timer, config } = state;
  const queryClient = useQueryClient();

  const editMutation = useMutation({
    mutationFn: ({ id, edit }: { id: string; edit: { driverId?: string; targetSec?: number } }) =>
      api.patch<RaceStateSnapshot>(`/api/race/schedule/${id}`, edit),
    onSuccess: (data) => queryClient.setQueryData(raceStateKey, data),
  });

  const currentKind = timer.sub === "inPit" ? "box" : "turno";
  const currentRowId =
    timer.phase === "running"
      ? schedule.find((r) => r.stintIndex === timer.currentStintIndex && r.kind === currentKind)?.id
      : undefined;

  // Projeção do total: real onde já se sabe, alvo para o que está pendente.
  // Assim o rodapé reflete sempre ~raceDurationSec, independentemente dos deltas.
  const totalProjected = schedule.reduce((sum, r) => sum + (r.actualSec ?? r.targetSec), 0);
  const totalActual = schedule.reduce((sum, r) => sum + (r.actualSec ?? 0), 0);
  // Soma dos desvios das fases já concluídas (negativo = adiantado, positivo = atrasado).
  const totalDelta = schedule.reduce((sum, r) => sum + (r.deltaSec ?? 0), 0);
  const hasAnyActual = schedule.some((r) => r.actualSec !== undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cronograma</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fase</TableHead>
              <TableHead>Piloto</TableHead>
              <TableHead className="text-right">Alvo</TableHead>
              <TableHead className="text-right">Prev. Entrada</TableHead>
              <TableHead className="text-right">Prev. Saída</TableHead>
              <TableHead className="text-right">Saída Real</TableHead>
              <TableHead className="text-right">Tempo Real</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((row) => {
              const editable = row.kind === "turno" && row.actualSec === undefined;
              return (
                <TableRow key={row.id} className={row.id === currentRowId ? "bg-amber-50" : undefined}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>
                    {editable && config ? (
                      <select
                        className="h-8 w-full max-w-32 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={row.driverId ?? ""}
                        disabled={editMutation.isPending}
                        onChange={(e) =>
                          editMutation.mutate({ id: row.id, edit: { driverId: e.target.value } })
                        }
                      >
                        {config.drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.driverName ?? "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {editable ? (
                      <input
                        // O alvo pode mudar por fora (rebalanceamento consoante o
                        // delta dos turnos anteriores, enviado por SSE). Como o
                        // input é "uncontrolled", forçamos a remontagem com uma
                        // `key` que inclui o targetSec para refletir esse valor.
                        key={`${row.id}-${row.targetSec}`}
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="h-8 w-20 rounded-lg border border-input bg-transparent px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        defaultValue={(row.targetSec / 60).toFixed(1)}
                        title={row.locked ? "Alvo definido manualmente" : "Alvo ajustado automaticamente"}
                        disabled={editMutation.isPending}
                        onBlur={(e) => {
                          const minutes = Number(e.target.value);
                          if (!Number.isFinite(minutes) || minutes <= 0) {
                            e.target.value = (row.targetSec / 60).toFixed(1);
                            return;
                          }
                          const targetSec = Math.round(minutes * 60);
                          if (targetSec === row.targetSec) return;
                          editMutation.mutate({ id: row.id, edit: { targetSec } });
                        }}
                      />
                    ) : (
                      formatDuration(row.targetSec)
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatClock(row.etaInMs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatClock(row.etaOutMs)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.actualOutMs !== undefined ? formatClock(row.actualOutMs) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.actualSec !== undefined ? formatDuration(row.actualSec) : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      row.deltaSec === undefined
                        ? ""
                        : row.deltaSec <= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                    }`}
                  >
                    {row.deltaSec !== undefined ? formatDelta(row.deltaSec) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatDuration(totalProjected)}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {hasAnyActual ? formatDuration(totalActual) : "—"}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-medium ${
                  totalDelta <= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {hasAnyActual ? formatDelta(totalDelta) : "—"}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        {editMutation.isError && (
          <p className="text-destructive mt-2 text-sm">
            {editMutation.error instanceof ApiRequestError
              ? editMutation.error.message
              : "Não foi possível atualizar o cronograma."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
