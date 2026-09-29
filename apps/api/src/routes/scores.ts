import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";
import { normalize, type RawScore } from "../lib/normalize.js";

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

  app.get("/api/v1/events/:eventId/scores/normalized", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const { eventId } = req.params as { eventId: string };
    const isOrganizer =
      actor.eventRoles[eventId] === "organizer" ||
      actor.platformRole === "admin";
    if (!isOrganizer) {
      reply.code(403);
      return { error: "forbidden" };
    }

    const rows = await prisma.score.findMany({
      where: { eventId },
      select: {
        judgeUserId: true,
        projectId: true,
        functionality: true,
        quality: true,
        innovation: true,
      },
    });

    const raw: RawScore[] = rows.map((r) => ({
      judgeUserId: r.judgeUserId,
      projectId: r.projectId,
      functionality: r.functionality,
      quality: r.quality,
      innovation: r.innovation,
    }));

    const result = normalize(raw);

    return {
      eventId,
      count: result.scores.length,
      judges: result.diagnostics.length,
      scores: result.scores,
      diagnostics: result.diagnostics,
    };
  });
}