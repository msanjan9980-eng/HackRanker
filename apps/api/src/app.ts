import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import { healthRoutes } from "./routes/health.js";
import { galleryRoutes } from "./routes/gallery.js";
import { submitRoutes } from "./routes/submit.js";
import { scoreRoutes } from "./routes/scores.js";
import { exportRoutes } from "./routes/export.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === "production" ? "warn" : "info" },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: process.env.SESSION_SECRET ?? "dev-only-secret" });

  await app.register(healthRoutes);
  await app.register(galleryRoutes);
  await app.register(submitRoutes);
  await app.register(scoreRoutes);
  await app.register(exportRoutes);

  return app;
}