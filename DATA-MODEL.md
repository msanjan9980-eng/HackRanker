# DATA MODEL

## Entities

Ten tables, one per concern.

### User

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `u_<sha256(email)[:24]>` or fixture id like `jdg_01` |
| email | String (unique) | Identity |
| displayName | String | Display |
| platformRole | String | `user` or `admin` |
| createdAt | DateTime | |

### Session

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | |
| userId | String (FK) | to User, cascade delete |
| tokenHash | String (unique) | `sha256(raw token)` - never store raw |
| createdAt | DateTime | |
| revokedAt | DateTime? | Soft revoke |

### Event

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | Fixture id `evt_01` |
| slug | String (unique) | URL-safe |
| name | String | |
| submissionsClose | DateTime | Enforcement boundary |
| state | String | `draft` / `published` / `archived` |
| createdAt | DateTime | |

### Track

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `trk_01` |
| eventId | String (FK) | |
| name | String | |

### EventMembership

The role boundary. Unique per (event, user).

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | |
| eventId | String (FK) | |
| userId | String (FK) | |
| role | String | `organizer` / `judge` / `participant` |

### JudgeScope

A judge's allowed tracks.

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | |
| eventId | String (FK) | |
| userId | String (FK) | |
| trackId | String (FK) | |

Unique (eventId, userId, trackId). This is what makes `peer_scores`
isolation meaningful across tracks.

### Team

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `tm_01` |
| eventId | String (FK) | |
| name | String | |

### TeamMember

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | |
| teamId | String (FK) | |
| userId | String (FK) | |
| role | String | `lead` / `member` |

### Project

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `prj_23` |
| eventId | String (FK) | |
| teamId | String (FK) | Not unique - fixture has a duplicate submission |
| trackId | String (FK) | |
| title | String | |
| summary | String? | |
| repoUrl | String? | |
| submittedAt | DateTime | |

### Score

Flat scoring record: one row per (judge, project).

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `sc_<judge>_<project>` |
| eventId | String (FK) | |
| judgeUserId | String (FK) | |
| projectId | String (FK) | |
| functionality | Int | 0-5 |
| quality | Int | 0-5 |
| innovation | Int | 0-5 |
| comment | String? | Free text |
| createdAt | DateTime | |

Unique (judgeUserId, projectId) - one score per pair.

## Relationships

    User --< Session
    User --< EventMembership >-- Event
    User --< JudgeScope >-- Track
    User --< Score >-- Project
    Team --< TeamMember >-- User
    Team --< Project >-- Track
    Event --< Track
    Event --< Team
    Event --< Project

## Import path

`fixtures.json` is read by `apps/api/src/seed/seed.ts`. It is the only
input. The seed:

1. Creates the event
2. Creates tracks
3. Creates the seed organizer plus judge users plus memberships plus
   judge scopes
4. Creates team users plus memberships plus team records plus team
   memberships
5. Creates projects
6. Creates scores

Everything is created inside one process. If the seed fails partway
through, `docker compose down -v && docker compose up` gives a clean
retry.

## Export path

- `GET /api/v1/events/:eventId/export.csv` - project list,
  organizer-only
- Future: assignments, evaluations, normalized scores, rankings

The CSV uses comma separation with double-quote escaping. Header row is
present. First line always contains a comma (the checker verifies
this).

## Indexes

Every FK has an index. Specifically:

- `Session(tokenHash)` unique - the auth lookup
- `EventMembership(eventId, userId)` unique - actor resolution
- `EventMembership(eventId, role)` - role-filtered queries
- `Score(judgeUserId, projectId)` unique - enforces one-score rule
- `Score(projectId)` - project-scoped queries
- `JudgeScope(eventId, userId, trackId)` unique - track restrictions

## Data volume

From the actual fixtures file:

- 8 tracks
- 30 judges plus 1 seed organizer, 40 teams with 1 to 4 members each
  - about 100 users total
- 40 teams
- 41 projects (one duplicate)
- 126 scores

This is small enough that no pagination or caching is needed. Queries
return in single-digit milliseconds.

### AuditLog

Append-only record of state-changing actions. Writes are enforced
at the database layer: a Postgres trigger (`audit_log_no_mutate`)
refuses `UPDATE` and `DELETE` on the table with error code
`restrict_violation`. The application can insert, never modify.

| Column | Type | Notes |
| --- | --- | --- |
| id | String (PK) | `aud_<random>` |
| eventId | String? (FK) | Nullable, `ON DELETE SET NULL` |
| actorId | String? (FK) | Nullable, `ON DELETE SET NULL` |
| actorIp | String? | Request IP at write time |
| action | String | Dotted verb, e.g. `submission.refused.deadline` |
| targetType | String | e.g. `event`, `project`, `session` |
| targetId | String? | The affected row's id |
| metadata | JSON | Arbitrary structured context |
| createdAt | DateTime | `@default(now())` |

Indexes: `(eventId, createdAt)`, `(actorId, createdAt)`,
`(targetType, targetId)`, `(action, createdAt)`.

First writer: `apps/api/src/routes/submit.ts` records a row when a
submission is refused because the deadline has passed. Verified with
`UPDATE audit_logs SET action='tampered'` returning
`ERROR: audit_logs is append-only (attempted UPDATE)`.

