import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().default("http://localhost:8080"),
  SESSION_SECRET: z.string().min(16).default("dev-only-secret-minimum-16-chars"),
});

export const env = Env.parse(process.env);