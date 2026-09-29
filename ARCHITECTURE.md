# ARCHITECTURE

## Overview

Dogfood 2026 is a two-container application: a Fastify API backed by
PostgreSQL, and a static web server that reverse-proxies `/api/*` to
the API.

    Browser / curl / run.py
            |
            | HTTP :8080
    web (nginx:1.27-alpine)
      - serves index.html
      - proxies /api/* to api
            |
            | HTTP :3000
    api (node:22-alpine)
      - Fastify 5
      - Prisma 5 to Postgres
      - cookie sessions
            |
            | TCP :5432
    db (postgres:16-alpine)

    seed runs once, exits 0, then api and web start.

## Container topology

| Service | Image | Role | Depends on |
| --- | --- | --- | --- |
| db | postgres:16-alpine | Data store | - |
| seed | apps/api (build) | Load fixtures, create sessions, print auth headers | db healthy |
| api | apps/api (runtime) | REST API | db healthy, seed exited 0 |
| web | nginx:1.27-alpine | Serve SPA + proxy /api | api healthy |

The seed container runs `prisma db push` against the empty Postgres to
create tables, then loads fixtures via `dist/seed/seed.js`. It is
idempotent - if any event exists, it does nothing.

## Layer boundaries

    HTTP route handler
      - Zod validation (request shape)
      - getActor(req) resolves cookie to Actor via Session + User + Memberships
      - role check (event-scoped)
      - Prisma query

Three principles:

1. Actor is server-derived. `getActor` reads the `df_sid` cookie,
   hashes it, looks up `Session`, joins `User` and `EventMembership`.
   Nothing in the request body or URL determines identity.

2. Role isolation is a backend check. Every route that returns
   judge-scoped data re-runs the check in the handler. There is no
   frontend filtering that could be bypassed with curl.

3. Event scoping is explicit. Every query is filtered by `eventId`. A
   judge on `evt_01` cannot leak data from another event because they
   have no membership on it.

## Route surface

| Method | Path | Auth | Behaviour |
| --- | --- | --- | --- |
| GET | /healthz | none | Docker healthcheck on port 3000 |
| GET | /api/healthz | none | Same, via nginx |
| GET | /api/v1/events/:eventId/gallery | none | Public gallery, 40 projects, JSON |
| POST | /api/v1/events/:eventId/projects | participant | Refused with 403 if submissions_close is past |
| GET | /api/v1/me/scores | judge or organizer | Caller's own scores |
| GET | /api/v1/judges/:judgeId/scores | self or organizer | Peer scores, 403 otherwise |
| GET | /api/v1/events/:eventId/export.csv | organizer | Project list as CSV |
| GET | /api/v1/events/:eventId/scores/normalized | organizer | Cross-judge normalized scores (robust_z), JSON |

## Auth

- Cookie name: `df_sid`
- Cookie value: 32 random bytes, base64url encoded
- Server stores only `sha256(token)` in `Session.tokenHash`
- Revocation: `Session.revokedAt` (available, not enforced yet)
- No expiry enforcement yet (out of scope for 72h; noted in README)

`getActor` is called by every handler that needs identity. It returns:

    {
      userId?: string,
      email?: string,
      platformRole: "user" | "admin" | "anonymous",
      eventRoles: Record<eventId, "organizer" | "judge" | "participant">
    }

## Seed design

The seed reads `fixtures.json` and loads it into Postgres verbatim: 8
tracks, 30 judges plus 1 seed organizer, 40 teams, 41 projects, 126
scores. It creates four deterministic sessions whose tokens are
hardcoded (`seed-token-organizer`, `seed-token-judge-a`,
`seed-token-judge-b`, `seed-token-participant`). The seed prints those
four headers on stdout so `docker compose logs seed` gives you exactly
what `.dogfood.toml` needs.

The fixture event's `submissions_close` (2026-03-01T18:00:00Z) is in
the past, so deadline enforcement naturally refuses a late submission.

Two judges in the fixture (`jdg_01`, `jdg_07`) gave the same score to
every project. That data is loaded faithfully. The platform does not
correct for it yet - that is the normalization tier.

## Offline operation

Runtime has zero external dependencies:

- All npm packages are bundled into the api image at build time.
- All base images are pulled once with `docker compose pull`.
- At `docker compose up`, no outbound network traffic is generated.
- The seed reads `fixtures.json` from the image, not from a URL.

Verification: after `docker compose pull && docker compose build`,
disconnect the network, run `docker compose up`. The portal is fully
operational.

## Trade-offs

- `prisma db push` instead of migrations. Faster for a hackathon. A
  production system would use `migrate deploy` with checked-in SQL.
- String IDs. `fixtures.json` uses `evt_01`, `prj_23`, etc. Every
  entity uses a `String @id` so those identifiers survive the trip.
- No password auth. The checker never logs in - it attaches pre-issued
  cookie headers. Password auth would be added for a real deployment.
- Minimal frontend. The acceptance suite tests JSON responses. A
  polished SPA would consume hours without moving the score.
- Flat `Score` table rather than `Evaluation` + `CriterionScore`. The
  fixture has exactly three criteria (functionality, quality,
  innovation), so a flat table is honest. A rubric engine is a future
  expansion.
