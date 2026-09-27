import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

export async function submitRoutes(app: FastifyInstance) {
  app.post("/api/v1/events/:eventId/projects", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const { eventId } = req.params as { eventId: string };
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      reply.code(404);
      return { error: "event_not_found" };
    }

    if (actor.eventRoles[eventId] !== "participant") {
      reply.code(403);
      return { error: "forbidden" };
    }

    if (event.submissionsClose.getTime() <= Date.now()) {
      reply.code(403);
      return { error: "submissions_closed" };
    }

    reply.code(201);
    return { project: { id: "new" } };
  });
}