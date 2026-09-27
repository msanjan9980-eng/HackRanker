# JUDGING

This document explains the judging layer: how assignments work, how
scores are captured, how role isolation is enforced, and what
normalization method the platform would apply to cross-judge bias.

The fixtures contain deliberately awkward data: two judges (`jdg_01`,
`jdg_07`) who gave every project the same score, projects with as few
as two reviews and neighbours with five, and a duplicate submission.
This document names those cases and says what the platform does with
them today, and what it should do next.

## Assignment

Not yet implemented as an algorithm. The fixtures provide a
pre-assigned matrix of 126 (judge, project) pairs. Each pair is loaded
as one row in the `Score` table with the constraint
`UNIQUE(judgeUserId, projectId)` preventing duplicate reviews.

Design for the next iteration (documented here, not shipped):

Load-balanced assignment with k-coverage.

1. Build the bipartite eligible (judge, project) graph. A judge is
   ineligible for a project if (a) they are on the project's team, or
   (b) they have an explicit conflict with the team.
2. Sort projects by fewest eligible judges, most constrained first.
3. For each project, assign k judges with the lowest current load,
   breaking ties with a seeded RNG.
4. Store the seed and parameters alongside the batch so the same
   assignment can be reproduced.

Reproducibility matters because an organizer should be able to justify
"why is judge X on project Y" without guessing.

## Scoring

Each score is a triple of integers:

    functionality: 0..5
    quality:       0..5
    innovation:    0..5

The fixture data uses a 2-5 range. The platform accepts 0-5 without
range validation yet - documented as a gap.

Weighted total design:

    total_jp = sum over c of (score_c / 5) * weight_c * 100

Weights default to equal (one third each) but the schema supports
arbitrary weights per criterion. The current fixtures have implicit
equal weights.

## Role isolation

The critical T2 property. Enforced at three levels:

1. Membership check. `getActor` builds `eventRoles` from
   `EventMembership`. A user with no row for the event has no role on
   the event.

2. Route-level guard on `GET /api/v1/judges/:judgeId/scores`:
   - Caller authenticated? else 401
   - Caller is the target judge? yes, allow
   - Caller is organizer on this event or platform admin? yes, allow
   - Otherwise 403

3. Track scoping (schema ready, route check pending). The
   `JudgeScope` table makes it possible to restrict a judge to
   specific tracks. The next iteration adds a check to the same route:
   if the caller is a judge but not the target, and the target judge's
   scores fall outside the caller's track scope, refuse.

The acceptance check `T2 judge cannot see peer scores` verifies level 2
by curl. It passes.

The acceptance check does not verify track-level isolation, but the
schema is prepared and the intent is documented. This is the honest
place to say: we built the DB primitive, we have not yet enforced it
on the read path.

## Normalization

The fixture data has two deliberately biased judges:

- `jdg_01`: gave every project a 2 on every criterion
- `jdg_07`: gave every project a 4 on every criterion

If those judges are scored alongside calibrated judges, their bias
would move rankings unfairly.

Method: robust_z (median absolute deviation z-score).

For each judge j, over their own set of scores:

    median_j = median(scores_by_j)
    MAD_j    = median(|score - median_j|)
    z_j(x)   = 0.6745 * (x - median_j) / MAD_j

The 0.6745 factor makes MAD-based z-scores comparable to standard
deviation based z-scores under normality.

Safeguards:

- Min sample. Normalize only when judge j has at least 5 completed
  evaluations. Below that, fall back to raw scores and flag the judge
  in diagnostics. Rationale: a judge with one review has no
  distribution to normalize against.
- MAD = 0. If `MAD_j` is zero, meaning all scores are identical - the
  `jdg_01`/`jdg_07` case - fall back to midrank percentile within the
  judge. Sort the judge's projects by score and assign each a
  percentile in [0, 1].
- Rescale. After per-judge normalization, pool all scores and linearly
  rescale to [0, 100] so rankings are readable.
- Report both. Every evaluation surfaces both `raw_weighted` and
  `normalized_value`. Deltas are visible in the results page.

Why robust_z and not additive bias correction? Additive bias subtracts
the judge's mean from every score, which corrects location but not
spread. A judge who uses only 4s and 5s has a narrow spread; a judge
who uses 1s through 5s has a wide one. Robust_z handles both because
it divides by MAD.

Why not z-score with standard deviation? Standard deviation is
sensitive to a single outlier. If a judge gives one project a 1 and
five projects a 5, standard deviation inflates and every score
compresses. MAD is resilient to a single outlier.

Worked example from the fixture data, once normalization ships:

    jdg_01 raw scores:    2, 2, 2, 2, 2, 2, 2
    median_01 = 2, MAD_01 = 0

Because MAD is 0, the fallback triggers. `jdg_01`'s projects are ranked
by midrank percentile and assigned neutral positions. The bias
evaporates.

    jdg_07 raw scores:    4, 4, 4, 4
    median_07 = 4, MAD_07 = 0

Same fallback. Both biased judges are neutralized.

Tie-break chain when final scores are equal:

1. finalScore desc
2. scoreStddev asc (more consistent projects rank higher)
3. judgeCount desc (more reviews)
4. submittedAt asc
5. projectId asc (deterministic final tiebreak)

## What is not yet implemented

- Assignment algorithm (design above)
- Normalization pass (design above)
- Organizer progress dashboard
- Inter-rater agreement, ICC(2,k) or Krippendorff's alpha

Each is documented here as intended work. The tier claim in
`.dogfood.toml` is T1 plus T2, and the acceptance report shows T2 as
verified at the role-isolation level. The remaining T2 items
(assignment, normalization) are design-complete but not shipped.

## Receipts

- `acceptance-report.txt` - the checker's output against this build
- `THREAT-MODEL.md` - the abuse analysis for voting and submissions