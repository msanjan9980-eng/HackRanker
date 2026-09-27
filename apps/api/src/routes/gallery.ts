import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function galleryRoutes(app: FastifyInstance) {
  app.get("/api/v1/events/:eventId/gallery", async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      reply.code(404);
      return { error: "event_not_found" };
    }

    const projects = await prisma.project.findMany({
      where: { eventId },
      orderBy: { submittedAt: "asc" },
      take: 40,
      select: {
        id: true,
        title: true,
        summary: true,
        repoUrl: true,
        submittedAt: true,
        track: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return {
      event: { id: event.id, name: event.name, submissionsClose: event.submissionsClose },
      count: projects.length,
      items: projects,
    };
  });
}