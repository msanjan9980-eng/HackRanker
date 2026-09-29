import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getActor } from "../auth/actor.js";

export async function commentRoutes(app: FastifyInstance) {
  // Public list of comments on a project
  app.get("/api/v1/projects/:projectId/comments", async (req) => {
    const { projectId } = req.params as { projectId: string };
    const items = await prisma.comment.findMany({
      where: { projectId, status: "visible" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        authorUserId: true,
        body: true,
        createdAt: true,
      },
    });
    return { projectId, count: items.length, items };
  });

  // Post a comment (auth required, member of event)
  app.post("/api/v1/projects/:projectId/comments", async (req, reply) => {
    const actor = await getActor(req);
    if (!actor.userId) { reply.code(401); return { error: "unauthorized" }; }

    const { projectId } = req.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { reply.code(404); return { error: "project_not_found" }; }

    if (!actor.eventRoles[project.eventId]) {
      reply.code(403);
      return { error: "not_a_member" };
    }

    const body = (req.body ?? {}) as { body?: string };
    if (!body.body || !body.body.trim()) {
      reply.code(400);
      return { error: "body_required" };
    }

    const comment = await prisma.comment.create({
      data: {
        id: "cm_" + Date.now() + "_" + actor.userId.slice(0, 6),
        eventId: project.eventId,
        projectId,
        authorUserId: actor.userId,
        body: body.body.slice(0, 5000),
        status: "visible",
      },
    });

    await prisma.auditLog.create({
      data: {
        id: "au_" + Date.now(),
        eventId: project.eventId,
        actorUserId: actor.userId,
        actorRole: actor.eventRoles[project.eventId] ?? "participant",
        action: "comment.created",
        entityType: "comment",
        entityId: comment.id,
      },
    });

    reply.code(201);
    return { comment };
  });
}