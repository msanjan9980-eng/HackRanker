import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/api/healthz", async () => ({ status: "ok" }));
}