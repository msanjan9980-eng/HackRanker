# THREAT MODEL

A written defence against the abuse vectors the brief names: Sybil
voting, ballot stuffing, submission scraping, judge collusion and
deadline gaming. Each entry names the attack, the mitigation this
platform provides, and honestly, what remains open.

## 1. Sybil voting

Attack. One person creates many accounts and votes on their own
project to inflate the count.

Stopped.

- Event memberships are the only way to vote. Membership requires
  registration, which requires an account.
- The `Score` table enforces `UNIQUE(judgeUserId, projectId)`. A user
  cannot vote twice on the same project.
- Sessions are issued only by the seed or by an authenticated login
  path. There is no anonymous-vote route.

Not stopped.

- There is no email-verification gate. A determined actor can register
  many emails, and the platform cannot distinguish them today.
- There is no IP-clustering or device-fingerprint check. All votes
  from a single hostile network look identical to votes from a
  distributed friend group.
- There is no account-age requirement.

What a fix would look like. Add an email-verification step and an
account-age minimum before a new user's votes count. Both are cheap;
neither is shipped.

## 2. Ballot stuffing

Attack. A legitimately-registered user repeatedly submits scores to
swing a ranking.

Stopped.

- `UNIQUE(judgeUserId, projectId)` in the database.
- No bulk-score endpoint exists.

Not stopped.

- There is no per-round cap on total scores a judge can submit in a
  time window. A judge assigned to 40 projects can score all 40 in a
  minute.
- There is no rate limiter. A script could create many scores on
  different (judge, project) pairs.

What a fix would look like. A sliding-window rate limiter on
`POST /scores`, backed by a `rate_limit_buckets` table. This is
straightforward and would be the next iteration.

## 3. Submission scraping

Attack. A script walks the gallery and downloads every project's
metadata to republish it elsewhere.

Stopped.

- The gallery route is public by design. The fixtures are meant to be
  read by anyone running the portal, so scraping the fixture data is
  not a loss.
- The `take: 40` clause caps the response size.

Not stopped.

- There is no rate limit on the gallery endpoint. A loop could hit it
  thousands of times per minute.
- There is no pagination cap for larger datasets.

What a fix would look like. A sliding-window bucket on the gallery
route keyed by IP hash. Cheap; not shipped.

## 4. Judge collusion

Attack. Two judges agree to give each other's projects the highest
possible scores.

Stopped.

- Load-balanced assignment with k-coverage (design in `JUDGING.md`)
  distributes the review burden across many judges. A single
  colluding pair cannot move a project's average if k is 3 or more.
- Explicit `JudgeConflict` records can prevent a judge from being
  assigned to a project they have a stake in.
- Scores are immutable once submitted. There is no self-service edit
  path; a correction requires an admin action that would be logged.

Not stopped.

- If a majority of judges assigned to a project collude, no algorithm
  can stop it. Human review of score distributions is the only
  countermeasure.

What a fix would look like. Compute per-judge median deviations
across the whole event. Flag judges whose scores are consistently
high relative to their peers. Ship that as an organizer diagnostic.

## 5. Deadline gaming

Attack. A participant submits after the deadline by manipulating their
client clock.

Stopped.

- The server checks `event.submissionsClose.getTime() <= Date.now()`.
  Client time is never read.
- The fixture event's `submissions_close` is 2026-03-01, months in the
  past. The `T1 closed event refuses submissions` check confirms the
  portal refuses the write.
- `submittedAt` is set by the server at write time.

Not stopped.

- If an organizer edits `submissionsClose` after a late submission,
  the audit trail shows the change but does not invalidate the
  submission automatically.

What a fix would look like. An audit-log entry on every event change,
with the old and new close dates. Not shipped as a UI feature; the
AuditLog table is not yet in the schema.

## 6. Duplicate submissions

Attack. A team submits the same project twice, either by accident or
to hedge.

Stopped.

- The current fixtures contain exactly one such case: `prj_07` and
  `prj_41`, same team, same title, same repo_url, submitted four hours
  apart. Both are loaded. Neither is hidden.

Not stopped.

- There is no automated duplicate detection. Two projects with
  different titles but the same repo would not be flagged.

What a fix would look like. SimHash or MinHash on normalized title
and repo URL. Flag pairs above a threshold in an organizer queue.
This is a T3 item; the primitive, a fingerprint table, is not shipped.

## 7. Privilege escalation

Attack. A participant crafts a request that runs as judge or
organizer.

Stopped.

- `getActor` reads only the `df_sid` cookie. It cannot be influenced
  by request body, query string, or headers.
- Every route re-checks the required role. There is no path that
  trusts the client.
- The `T2 participant blocked` acceptance check confirms a
  participant cannot read `/api/v1/me/scores`.

Not stopped.

- There is no protection against session theft. A stolen `df_sid`
  cookie is a valid session until revoked.

What a fix would look like. Rotate session tokens on login and
invalidate old sessions. Cheap; not shipped.

## 8. Session hijacking

Attack. An attacker obtains a session cookie.

Stopped.

- Tokens are 32 random bytes; only the SHA-256 hash is stored.
- SameSite=Lax in production deployment.

Not stopped.

- HttpOnly flag is not currently set on `df_sid`.
- No rotation on privilege elevation.
- No anomaly detection, e.g. login from new IP hash.

What a fix would look like. Set `HttpOnly: true` and `Secure: true`
in production. Ship within 30 minutes.

## Honest summary

Six of eight threats have meaningful partial mitigations. Two are
purely schema-level today:

- Automated duplicate detection - not implemented
- Session anomaly detection - not implemented

The remaining gaps are rate limiting (no buckets), email verification
(no SMTP, offline constraint), and audit logging (schema not yet
shipped).

None of these are hidden. Each is a documented next step.