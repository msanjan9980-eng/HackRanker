CREATE UNIQUE INDEX "TeamMember_one_owner_per_team"
  ON "TeamMember" ("teamId")
  WHERE "role" = 'OWNER';

CREATE UNIQUE INDEX "TeamInvite_one_pending_per_email"
  ON "TeamInvite" ("teamId", lower("email"))
  WHERE "status" = 'PENDING';
