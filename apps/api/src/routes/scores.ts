import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

const SELECT = {
  id: true,
  projectId: true,
  functionality: true,
  quality: true,
  innovation: true,
  comment: true,
  createdAt: true,
} as const;

export async function scoreRoutes(app: FastifyInstance) {
  // Own scores â€” caller must be a judge
  app.get("/api/v1/me/scores", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const isJudge = Object.values(actor.eventRoles).includes("judge");
    const isOrganizer =
      Object.values(actor.eventRoles).includes("organizer") ||
      actor.platformRole === "admin";
    if (!isJudge && !isOrganizer) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const scores = await prisma.score.findMany({
      where: { judgeUserId: actor.userId },
      select: SELECT,
      orderBy: { createdAt: "asc" },
    });

    return { judgeUserId: actor.userId, count: scores.length, scores };
  });

  // Peer scores â€” self, or organizer. Otherwise refuse.
  app.get("/api/v1/judges/:judgeId/scores", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const { judgeId } = req.params as { judgeId: string };

    if (actor.userId === judgeId) {
      const scores = await prisma.score.findMany({
        where: { judgeUserId: judgeId },
        select: SELECT,
        orderBy: { createdAt: "asc" },
      });
      return { judgeUserId: judgeId, count: scores.length, scores };
    }

    const isOrganizer =
      Object.values(actor.eventRoles).includes("organizer") ||
      actor.platformRole === "admin";
    if (isOrganizer) {
      const scores = await prisma.score.findMany({
        where: { judgeUserId: judgeId },
        select: SELECT,
        orderBy: { createdAt: "asc" },
      });
      return { judgeUserId: judgeId, count: scores.length, scores };
    }

    reply.code(403);
    return { error: "forbidden" };
  });
}