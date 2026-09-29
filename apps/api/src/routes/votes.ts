import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

export async function voteRoutes(app: FastifyInstance) {
  // List vote rounds for an event (auth required)
  app.get("/api/v1/events/:eventId/vote-rounds", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) { reply.code(401); return { error: "unauthorized" }; }
    const { eventId } = req.params as { eventId: string };
    const items = await prisma.voteRound.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
    return { items };
  });

  // Tally for a round. Hidden from non-organizers while resultsHidden and round open.
  app.get("/api/v1/vote-rounds/:roundId/tally", async (req, reply) => {
    const actor = await getActor(req);
    const { roundId } = req.params as { roundId: string };
    const round = await prisma.voteRound.findUnique({ where: { id: roundId } });
    if (!round) { reply.code(404); return { error: "not_found" }; }

    const isOrganizer =
      actor.eventRoles[round.eventId] === "organizer" ||
      actor.platformRole === "admin";
    const hidden = round.resultsHidden && round.state === "open" && !isOrganizer;
    if (hidden) return { round, hidden: true, rows: null };

    const grouped = await prisma.vote.groupBy({
      by: ["projectId"],
      where: { roundId },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({ projectId: g.projectId, votes: g._count._all }))
      .sort((a, b) => b.votes - a.votes);
    return { round, hidden: false, rows };
  });

  // Cast a vote (participant only, once per project per round)
  app.post("/api/v1/vote-rounds/:roundId/votes", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) { reply.code(401); return { error: "unauthorized" }; }
    const { roundId } = req.params as { roundId: string };
    const round = await prisma.voteRound.findUnique({ where: { id: roundId } });
    if (!round) { reply.code(404); return { error: "not_found" }; }
    if (round.state !== "open") { reply.code(409); return { error: "round_closed" }; }

    const role = actor.eventRoles[round.eventId];
    if (role !== "participant" && role !== "organizer" && actor.platformRole !== "admin") {
      reply.code(403);
      return { error: "forbidden" };
    }

    const body = (req.body ?? {}) as { projectId?: string };
    if (!body.projectId) { reply.code(400); return { error: "projectId_required" }; }

    try {
      const vote = await prisma.vote.create({
        data: {
          id: "vt_" + actor.userId + "_" + body.projectId,
          roundId,
          voterUserId: actor.userId,
          projectId: body.projectId,
          value: 1,
        },
      });
      reply.code(201);
      return { vote };
    } catch {
      reply.code(409);
      return { error: "already_voted" };
    }
  });
}