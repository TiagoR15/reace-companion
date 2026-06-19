import type { FastifyInstance } from "fastify";
import { raceState } from "../state.js";

export function registerTimerRoutes(app: FastifyInstance): void {
  app.post("/api/race/start", async (_request, reply) => {
    const state = raceState.getState();
    if (!state.config) {
      return reply.code(400).send({ error: "Configura a corrida antes de começar." });
    }
    if (state.timer.phase !== "idle") {
      return reply.code(400).send({ error: "A corrida já começou." });
    }

    raceState.start();
    return raceState.getState();
  });

  app.post("/api/race/pit", async (_request, reply) => {
    const state = raceState.getState();
    if (state.timer.phase !== "running" || state.timer.sub !== "onTrack") {
      return reply.code(400).send({ error: "Não é possível registar entrada no pit agora." });
    }

    raceState.pit();
    return raceState.getState();
  });
}
