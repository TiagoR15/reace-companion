import type { FastifyInstance } from "fastify";
import { raceState, type RaceStateSnapshot } from "../state.js";

export function registerLiveRoutes(app: FastifyInstance): void {
  app.get("/api/live", async () => raceState.getState().live);

  app.get("/api/stream", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": request.headers.origin ?? "*",
    });

    const send = (snapshot: RaceStateSnapshot) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    };

    send(raceState.getState());
    raceState.on("update", send);

    request.raw.on("close", () => {
      raceState.off("update", send);
    });
  });
}
