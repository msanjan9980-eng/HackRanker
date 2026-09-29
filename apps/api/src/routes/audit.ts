import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/api/v1/events/:eventId/audit", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) { reply.code(401); return { error: "unauthorized" }; }

    const { eventId } = req.params as { eventId: string };
    const isOrganizer =
      actor.eventRoles[eventId] === "organizer" ||
      actor.platformRole === "admin";
    if (!isOrganizer) { reply.code(403); return { error: "forbidden" }; }

    const items = await prisma.auditLog.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });
    return { eventId, count: items.length, items };
  });
}