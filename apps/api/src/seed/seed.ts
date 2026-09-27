import fs from "node:fs";
import { prisma } from "../db.js";
import { sha256Hex } from "../lib/hash.js";

const FIXTURE_PATH = process.env.FIXTURES_PATH ?? "/app/fixtures.json";

const SEED_TOKENS = {
  organizer:   "seed-token-organizer",
  judge_a:     "seed-token-judge-a",
  judge_b:     "seed-token-judge-b",
  participant: "seed-token-participant",
};

function userIdFromEmail(email: string): string {
  return "u_" + sha256Hex(email).slice(0, 24);
}

interface Fixture {
  event: { id: string; name: string; submissions_close: string };
  tracks: { id: string; name: string }[];
  judges: { id: string; name: string; email: string; tracks: string[] }[];
  teams: { id: string; name: string; members: string[] }[];
  projects: { id: string; team: string; track: string; title: string; summary: string; repo_url: string; submitted_at: string }[];
  scores: { judge: string; project: string; criteria: { functionality?: number; quality?: number; innovation?: number }; comment?: string }[];
}

async function main() {
  console.log("seed: reading fixtures from " + FIXTURE_PATH);
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  const fixture: Fixture = JSON.parse(raw);

  const existing = await prisma.event.count();
  if (existing > 0) {
    console.log("seed: data already present, skipping");
    return;
  }

  await prisma.event.create({
    data: {
      id: fixture.event.id,
      slug: fixture.event.id,
      name: fixture.event.name,
      submissionsClose: new Date(fixture.event.submissions_close),
      state: "published",
    },
  });

  for (const t of fixture.tracks) {
    await prisma.track.create({
      data: { id: t.id, eventId: fixture.event.id, name: t.name },
    });
  }

  const orgEmail = "organizer@dogfood.local";
  const orgId = userIdFromEmail(orgEmail);
  await prisma.user.create({
    data: { id: orgId, email: orgEmail, displayName: "Seed Organizer", platformRole: "admin" },
  });
  await prisma.eventMembership.create({
    data: { id: "em_org", eventId: fixture.event.id, userId: orgId, role: "organizer" },
  });
  await prisma.session.create({
    data: { id: "sess_org", userId: orgId, tokenHash: sha256Hex(SEED_TOKENS.organizer) },
  });

  for (const j of fixture.judges) {
    await prisma.user.create({
      data: { id: j.id, email: j.email, displayName: j.name },
    });
    await prisma.eventMembership.create({
      data: { id: "em_" + j.id, eventId: fixture.event.id, userId: j.id, role: "judge" },
    });
    for (const trackId of j.tracks) {
      await prisma.judgeScope.create({
        data: { id: "js_" + j.id + "_" + trackId, eventId: fixture.event.id, userId: j.id, trackId },
      });
    }
  }

  await prisma.session.create({
    data: { id: "sess_judge_a", userId: "jdg_01", tokenHash: sha256Hex(SEED_TOKENS.judge_a) },
  });
  await prisma.session.create({
    data: { id: "sess_judge_b", userId: "jdg_02", tokenHash: sha256Hex(SEED_TOKENS.judge_b) },
  });

  for (const team of fixture.teams) {
    await prisma.team.create({
      data: { id: team.id, eventId: fixture.event.id, name: team.name },
    });
    for (const email of team.members) {
      const uid = userIdFromEmail(email);
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: { id: uid, email, displayName: email.split("@")[0] },
      });
      await prisma.eventMembership.upsert({
        where: { eventId_userId: { eventId: fixture.event.id, userId: uid } },
        update: {},
        create: { id: "em_" + uid, eventId: fixture.event.id, userId: uid, role: "participant" },
      });
      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: uid } },
        update: {},
        create: { id: "tm_" + team.id + "_" + uid, teamId: team.id, userId: uid },
      });
    }
  }

  for (const p of fixture.projects) {
    await prisma.project.create({
      data: {
        id: p.id,
        eventId: fixture.event.id,
        teamId: p.team,
        trackId: p.track,
        title: p.title,
        summary: p.summary,
        repoUrl: p.repo_url,
        submittedAt: new Date(p.submitted_at),
      },
    });
  }

  for (const s of fixture.scores) {
    await prisma.score.create({
      data: {
        id: "sc_" + s.judge + "_" + s.project,
        eventId: fixture.event.id,
        judgeUserId: s.judge,
        projectId: s.project,
        functionality: s.criteria.functionality ?? 0,
        quality: s.criteria.quality ?? 0,
        innovation: s.criteria.innovation ?? 0,
        comment: s.comment ?? null,
      },
    });
  }

  const participantId = userIdFromEmail("priya1@example.org");
  await prisma.session.create({
    data: { id: "sess_prt", userId: participantId, tokenHash: sha256Hex(SEED_TOKENS.participant) },
  });

  const counts = {
    tracks: await prisma.track.count(),
    judges: await prisma.eventMembership.count({ where: { role: "judge" } }),
    teams: await prisma.team.count(),
    projects: await prisma.project.count(),
    scores: await prisma.score.count(),
  };
  console.log("seed: loaded", JSON.stringify(counts));

  console.log("");
  console.log("=====================================================");
  console.log("DOGFOOD 2026 seed complete â€” auth headers:");
  console.log("-----------------------------------------------------");
  console.log('organizer   = "Cookie: df_sid=' + SEED_TOKENS.organizer + '"');
  console.log('judge_a     = "Cookie: df_sid=' + SEED_TOKENS.judge_a + '"');
  console.log('judge_b     = "Cookie: df_sid=' + SEED_TOKENS.judge_b + '"');
  console.log('participant = "Cookie: df_sid=' + SEED_TOKENS.participant + '"');
  console.log("=====================================================");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());