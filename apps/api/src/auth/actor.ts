import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { sha256Hex } from "../lib/hash.js";

export interface Actor {
  userId?: string;
  email?: string;
  platformRole: string;
  eventRoles: Record<string, string>;
}

const ANON: Actor = { platformRole: "anonymous", eventRoles: {} };

export async function getActor(req: FastifyRequest): Promise<Actor> {
  const raw = (req as any).cookies?.df_sid;
  if (!raw) return ANON;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(raw) },
    include: { user: { include: { memberships: true } } },
  });
  if (!session || session.revokedAt) return ANON;

  const eventRoles: Record<string, string> = {};
  for (const m of session.user.memberships) eventRoles[m.eventId] = m.role;

  return {
    userId: session.userId,
    email: session.user.email,
    platformRole: session.user.platformRole,
    eventRoles,
  };
}