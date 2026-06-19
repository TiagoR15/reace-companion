import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerLiveRoutes } from "./routes/live.js";
import { registerRaceRoutes } from "./routes/race.js";
import { registerTimerRoutes } from "./routes/timer.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
});

registerRaceRoutes(app);
registerTimerRoutes(app);
registerLiveRoutes(app);

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
