"use client";

import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RaceStateSnapshot } from "@/lib/types";

export function LiveTiming({ state }: { state: RaceStateSnapshot }) {
  const { live, config } = state;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live timing</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!live || live.karts.length === 0 ? (
          <p className="text-muted-foreground text-sm">A aguardar dados do live timing...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Pos</TableHead>
                <TableHead>Kart</TableHead>
                <TableHead>Equipa</TableHead>
                <TableHead className="text-right">Última</TableHead>
                <TableHead className="text-right">Melhor</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead className="text-right">Voltas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {live.karts.map((kart) => {
                const isOurTeam = config?.teamId === kart.no;
                return (
                  <TableRow key={kart.no} className={isOurTeam ? "bg-amber-50 font-semibold" : undefined}>
                    <TableCell className="text-right tabular-nums">{kart.pos}</TableCell>
                    <TableCell className="flex items-center gap-1.5 tabular-nums">
                      {isOurTeam && <Star className="h-3.5 w-3.5 text-amber-500" />}
                      {kart.no}
                    </TableCell>
                    <TableCell>{kart.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{kart.lastLap ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{kart.bestLap ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{kart.gap ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{kart.laps ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
