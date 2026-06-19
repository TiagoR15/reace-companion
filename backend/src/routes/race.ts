import type { FastifyInstance } from "fastify";
import { ensureApexClient } from "../apex/manager.js";
import { RULES } from "../rules.js";
import { raceState } from "../state.js";
import type { Driver, RaceConfig } from "../types.js";

interface ConfigBody {
  teamId?: unknown;
  circuitSlug?: unknown;
  raceDurationSec?: unknown;
  drivers?: unknown;
}

function validateConfig(body: ConfigBody): RaceConfig | { error: string } {
  if (typeof body.teamId !== "string" || body.teamId.trim() === "") {
    return { error: "teamId é obrigatório (nº/id do kart da equipa, usado para filtrar o feed)." };
  }

  const circuitSlug =
    typeof body.circuitSlug === "string" && body.circuitSlug.trim() !== ""
      ? body.circuitSlug.trim()
      : "kartodromodebaltar";

  let raceDurationSec: number | undefined;
  if (
    body.raceDurationSec !== undefined &&
    body.raceDurationSec !== null &&
    body.raceDurationSec !== ""
  ) {
    const r = Number(body.raceDurationSec);
    if (!Number.isFinite(r) || r <= 0) {
      return { error: "Duração da prova inválida." };
    }
    raceDurationSec = Math.round(r);
  }

  if (!Array.isArray(body.drivers)) {
    return { error: "drivers é obrigatório (lista de pilotos)." };
  }
  if (body.drivers.length < RULES.minDrivers || body.drivers.length > RULES.maxDrivers) {
    return {
      error: `Número de pilotos inválido. Tem de estar entre ${RULES.minDrivers} e ${RULES.maxDrivers}.`,
    };
  }

  const drivers: Driver[] = [];
  for (let i = 0; i < body.drivers.length; i++) {
    const raw = body.drivers[i] as Record<string, unknown>;
    if (typeof raw.name !== "string" || raw.name.trim() === "") {
      return { error: `Piloto ${i + 1}: nome é obrigatório.` };
    }

    const driver: Driver = {
      id: typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim() : `d${i}`,
      name: raw.name.trim(),
    };

    if (raw.weightKg !== undefined && raw.weightKg !== null && raw.weightKg !== "") {
      const w = Number(raw.weightKg);
      if (!Number.isFinite(w) || w <= 0) {
        return { error: `Piloto ${i + 1}: peso inválido.` };
      }
      driver.weightKg = w;
    }

    if (raw.maxStintSec !== undefined && raw.maxStintSec !== null && raw.maxStintSec !== "") {
      const m = Number(raw.maxStintSec);
      if (!Number.isFinite(m) || m <= 0) {
        return { error: `Piloto ${i + 1}: tempo máximo de stint inválido.` };
      }
      driver.maxStintSec = m;
    }

    drivers.push(driver);
  }

  return { teamId: body.teamId.trim(), circuitSlug, raceDurationSec, drivers };
}

export function registerRaceRoutes(app: FastifyInstance): void {
  app.post("/api/race/config", async (request, reply) => {
    const validated = validateConfig(request.body as ConfigBody);
    if ("error" in validated) {
      return reply.code(400).send(validated);
    }

    const result = raceState.setConfig(validated);
    if ("error" in result) {
      return reply.code(400).send(result);
    }

    ensureApexClient(validated.circuitSlug);
    return raceState.getState();
  });

  app.get("/api/race/state", async () => raceState.getState());

  app.patch("/api/race/schedule/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { driverId?: unknown; targetSec?: unknown };

    const edit: { driverId?: string; targetSec?: number } = {};

    if (body.driverId !== undefined) {
      if (typeof body.driverId !== "string" || body.driverId.trim() === "") {
        return reply.code(400).send({ error: "driverId inválido." });
      }
      edit.driverId = body.driverId;
    }

    if (body.targetSec !== undefined) {
      const t = Number(body.targetSec);
      if (!Number.isFinite(t) || t <= 0) {
        return reply.code(400).send({ error: "targetSec inválido." });
      }
      edit.targetSec = t;
    }

    if (edit.driverId === undefined && edit.targetSec === undefined) {
      return reply.code(400).send({ error: "Nada para atualizar (driverId e/ou targetSec)." });
    }

    const result = raceState.editScheduleRow(id, edit);
    if ("error" in result) {
      return reply.code(400).send(result);
    }
    return result;
  });
}
