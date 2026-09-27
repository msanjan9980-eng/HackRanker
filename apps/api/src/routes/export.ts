import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.indexOf(",") >= 0 || s.indexOf("\"") >= 0 || s.indexOf("\n") >= 0) {
    return "\"" + s.split("\"").join("\"\"") + "\"";
  }
  return s;
}

export async function exportRoutes(app: FastifyInstance) {
  app.get("/api/v1/events/:eventId/export.csv", async (req, reply) => {
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

    const projects = await prisma.project.findMany({
      where: { eventId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        title: true,
        submittedAt: true,
        team: { select: { id: true, name: true } },
        track: { select: { id: true, name: true } },
      },
    });

    const lines = ["project_id,title,team_id,team_name,track_id,track_name,submitted_at"];
    for (const p of projects) {
      lines.push(
        [
          csvCell(p.id),
          csvCell(p.title),
          csvCell(p.team.id),
          csvCell(p.team.name),
          csvCell(p.track.id),
          csvCell(p.track.name),
          csvCell(p.submittedAt.toISOString()),
        ].join(","),
      );
    }

    reply.type("text/csv; charset=utf-8");
    return lines.join("\n") + "\n";
  });
}