"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, ApiRequestError } from "@/lib/api";
import { DISPLAY_RULES } from "@/lib/rules";
import { raceStateKey } from "@/hooks/useRaceState";
import type { RaceConfig, RaceStateSnapshot } from "@/lib/types";
import { AlertCircle } from "lucide-react";

function optionalPositiveNumber(max?: number, maxMessage?: string) {
  return z.string().transform((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;

    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Inválido" });
      return undefined;
    }
    if (max !== undefined && n > max) {
      ctx.addIssue({ code: "custom", message: maxMessage ?? `Máx. ${max}` });
      return undefined;
    }
    return n;
  });
}

const driverSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  weightKg: optionalPositiveNumber(),
  maxStintMin: optionalPositiveNumber(
    DISPLAY_RULES.maxStintMin,
    `Máx. ${DISPLAY_RULES.maxStintMin} min`,
  ),
});

const setupSchema = z.object({
  teamId: z.string().trim().min(1, "Obrigatório"),
  circuitSlug: z.string().trim().optional(),
  raceDurationHours: optionalPositiveNumber(),
  drivers: z
    .array(driverSchema)
    .min(DISPLAY_RULES.minDrivers, `Mínimo ${DISPLAY_RULES.minDrivers} pilotos`)
    .max(DISPLAY_RULES.maxDrivers, `Máximo ${DISPLAY_RULES.maxDrivers} pilotos`),
});

type SetupFormInput = z.input<typeof setupSchema>;
type SetupFormOutput = z.output<typeof setupSchema>;

function emptyDriver(): SetupFormInput["drivers"][number] {
  return { name: "", weightKg: "", maxStintMin: String(DISPLAY_RULES.maxStintMin) };
}

export default function SetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SetupFormInput, unknown, SetupFormOutput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      teamId: "",
      circuitSlug: "kartodromodebaltar",
      raceDurationHours: String(DISPLAY_RULES.raceDurationHours),
      drivers: [emptyDriver(), emptyDriver()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "drivers" });

  const mutation = useMutation({
    mutationFn: async (config: RaceConfig) => api.post<RaceStateSnapshot>("/api/race/config", config),
    onSuccess: (data) => {
      queryClient.setQueryData(raceStateKey, data);
      router.push("/dashboard");
    },
  });

  const onSubmit = (data: SetupFormOutput) => {
    const config: RaceConfig = {
      teamId: data.teamId,
      circuitSlug: data.circuitSlug?.trim() || "kartodromodebaltar",
      raceDurationSec: data.raceDurationHours
        ? Math.round(data.raceDurationHours * 3600)
        : DISPLAY_RULES.raceDurationSec,
      drivers: data.drivers.map((d) => ({
        name: d.name,
        weightKg: d.weightKg,
        maxStintSec: d.maxStintMin ? Math.round(d.maxStintMin * 60) : undefined,
      })),
    };
    mutation.mutate(config);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Race Companion</h1>
        <p className="text-muted-foreground text-sm">
          Resistência 7H — Kartódromo de Baltar. Configura a equipa para gerar a estratégia.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regulamento</CardTitle>
          <CardDescription>Valores fixos da prova (não editáveis)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Duração</div>
            <div className="font-medium">{DISPLAY_RULES.raceDurationHours}h</div>
          </div>
          <div>
            <div className="text-muted-foreground">Paragens obrigatórias</div>
            <div className="font-medium">{DISPLAY_RULES.mandatoryStops}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Pit mínimo</div>
            <div className="font-medium">{DISPLAY_RULES.pitMinMin} min</div>
          </div>
          <div>
            <div className="text-muted-foreground">Stint máximo</div>
            <div className="font-medium">{DISPLAY_RULES.maxStintMin} min</div>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Equipa</CardTitle>
            <CardDescription>
              Nº/id do kart, usado para identificar a equipa no live timing
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="teamId">Nº do kart (id da equipa)</Label>
              <Input id="teamId" placeholder="ex: 7" {...register("teamId")} />
              {errors.teamId && <p className="text-destructive text-xs">{errors.teamId.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="circuitSlug">Circuito (Apex Timing)</Label>
              <Input id="circuitSlug" placeholder="kartodromodebaltar" {...register("circuitSlug")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="raceDurationHours">Duração da prova (h)</Label>
              <Input
                id="raceDurationHours"
                type="number"
                step="0.5"
                placeholder={String(DISPLAY_RULES.raceDurationHours)}
                {...register("raceDurationHours")}
              />
              {errors.raceDurationHours && (
                <p className="text-destructive text-xs">{errors.raceDurationHours.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pilotos</CardTitle>
            <CardDescription>
              Entre {DISPLAY_RULES.minDrivers} e {DISPLAY_RULES.maxDrivers} pilotos. Tempo máximo de
              stint por piloto (default {DISPLAY_RULES.maxStintMin} min, não pode exceder este valor).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor={`drivers.${index}.name`}>Nome</Label>
                  <Input
                    id={`drivers.${index}.name`}
                    placeholder={`Piloto ${index + 1}`}
                    {...register(`drivers.${index}.name`)}
                  />
                  {errors.drivers?.[index]?.name && (
                    <p className="text-destructive text-xs">
                      {errors.drivers[index]?.name?.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5 sm:w-32">
                  <Label htmlFor={`drivers.${index}.weightKg`}>Peso (kg)</Label>
                  <Input
                    id={`drivers.${index}.weightKg`}
                    type="number"
                    step="0.1"
                    placeholder="opcional"
                    {...register(`drivers.${index}.weightKg`)}
                  />
                  {errors.drivers?.[index]?.weightKg && (
                    <p className="text-destructive text-xs">
                      {errors.drivers[index]?.weightKg?.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5 sm:w-36">
                  <Label htmlFor={`drivers.${index}.maxStintMin`}>Stint máx. (min)</Label>
                  <Input
                    id={`drivers.${index}.maxStintMin`}
                    type="number"
                    step="1"
                    {...register(`drivers.${index}.maxStintMin`)}
                  />
                  {errors.drivers?.[index]?.maxStintMin && (
                    <p className="text-destructive text-xs">
                      {errors.drivers[index]?.maxStintMin?.message}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={fields.length <= DISPLAY_RULES.minDrivers}
                  onClick={() => remove(index)}
                >
                  Remover
                </Button>
              </div>
            ))}

            {errors.drivers?.root && (
              <p className="text-destructive text-xs">{errors.drivers.root.message}</p>
            )}
            {errors.drivers?.message && (
              <p className="text-destructive text-xs">{errors.drivers.message}</p>
            )}

            <Separator />

            <Button
              type="button"
              variant="outline"
              disabled={fields.length >= DISPLAY_RULES.maxDrivers}
              onClick={() => append(emptyDriver())}
            >
              + Adicionar piloto
            </Button>
          </CardContent>
        </Card>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof ApiRequestError
                ? mutation.error.message
                : "Não foi possível ligar ao servidor."}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? "A calcular estratégia..." : "Calcular estratégia"}
        </Button>
      </form>
    </main>
  );
}
