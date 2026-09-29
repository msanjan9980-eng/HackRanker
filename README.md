# Dogfood 2026

A self-hostable hackathon submission and judging platform, built for the
Dogfood 2026 hackathon. The platform loads the shared `fixtures.json` on
boot and exposes the seven routes the official `run.py` acceptance
checker probes.

## Quick start

    docker compose up

On first boot the `seed` container loads `fixtures.json` into Postgres
(tracks, judges, teams, projects, scores), creates deterministic
sessions, and prints the four auth headers the checker expects. Once the
`api` container reports `healthy`, the portal is at
http://localhost:8080.

Everything runs offline. No cloud dependencies, no hosted database, no
external auth provider, no outbound network calls at runtime.

## Verified tiers

Claimed: **T1 (Core)** and **T2 (Judging)**.

The acceptance report at `acceptance-report.txt` is the output of the
official checker against this build:

    T1  gallery is public ................. PASS
    T1  project from fixtures shown ....... PASS
    T1  closed event refuses submissions .. PASS
    T2  judge sees own scores ............. PASS
    T2  judge cannot see peer scores ...... PASS
    T2  participant blocked ............... PASS
    T2  csv export works .................. PASS

## What works

T1 - Core

- Users, sessions, event-scoped memberships
- One event (`evt_01`, "Sample Hack 2026") seeded from fixtures
- 8 tracks, 40 teams, 41 projects loaded from fixtures
- Public gallery with all submitted projects
- Deadline enforcement: fixture event's `submissions_close` is in the
  past, so project creation returns `403 submissions_closed`

T2 - Judging

- 30 judges and 126 scores loaded from fixtures
- Judge scope by track: `judge_scopes` table restricts each judge to
  their assigned tracks
- Backend-enforced role isolation:
  - `GET /api/v1/me/scores` refuses non-judges
  - `GET /api/v1/judges/:judgeId/scores` refuses everyone except the
    judge themselves and organizers/admins
- CSV export of projects by organizer

## T3 evidence shipped

- Append-only `audit_logs` table. Postgres trigger `audit_log_no_mutate`
  refuses `UPDATE` and `DELETE`. Verified: `UPDATE audit_logs ...`
  raises `audit_logs is append-only (attempted UPDATE)`.
- Cross-judge normalization at `apps/api/src/lib/normalize.ts`:
  robust_z (MAD-based) with midrank fallback for zero-variance judges
  and an insufficient-sample guard at `MIN_SAMPLE = 5`. Exposed at
  `GET /api/v1/events/:eventId/scores/normalized` (organizer only).
- Vitest suite (`apps/api/test/normalize.test.ts`) - 11 tests covering
  raw weighted score, empty input, insufficient sample, midrank
  fallback, robust_z exact values, determinism, and [0,100] rescale.
- Rate limiting via `@fastify/rate-limit`:
  `POST /projects` 10 req/min per session; `GET /gallery` 60 req/min
  per IP. Registered with `global: false`, opted in per route.

## What does not work yet

- Community voting (T3)
- Comments (T3)
- Automated duplicate submission detection (T3)
- Organizer progress dashboard
- REST/webhook surface (T4)
- Session revocation enforcement (available in schema, not enforced)
- Email verification (offline constraint)

These are noted honestly rather than claimed. The acceptance report is
the receipt.

## Architecture at a glance

- Runtime: Node 22 + Fastify 5 + TypeScript
- Database: PostgreSQL 16 (container)
- ORM: Prisma 5
- Frontend: static page served by nginx (deliberately minimal - the
  acceptance suite probes JSON routes)
- Auth: cookie-based sessions (`df_sid`), SHA-256-hashed tokens

Full details in `ARCHITECTURE.md`. Schema in `DATA-MODEL.md`. Judging
maths in `JUDGING.md`. Abuse analysis in `THREAT-MODEL.md`.

## Running the acceptance checker

    python run.py .dogfood.toml > acceptance-report.txt

## License

MIT. See `LICENSE`.
