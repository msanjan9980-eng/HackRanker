import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = await buildApp();
await app.listen({ host: "0.0.0.0", port: env.PORT });