import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: process.env.SESSION_SECRET ?? "dev-only-secret" });

  // Internal (Docker healthcheck hits this directly on port 3000)
  app.get("/healthz", async () => ({ status: "ok" }));

  // External (nginx proxies /api/* → api:3000/api/*, path preserved)
  app.get("/api/healthz", async () => ({ status: "ok" }));

  return app;
}