import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  insert into "TournamentSub" (
    "userId",
    "tournamentId",
    "canVc",
    "bestWeapons",
    "okWeapons",
    "message",
    "visibility"
  )
  values (
    @userId,
    @tournamentId,
    @canVc,
    @bestWeapons,
    @okWeapons,
    @message,
    @visibility
  )
  on conflict ("userId", "tournamentId") do
  update
  set
    "canVc" = @canVc,
    "bestWeapons" = @bestWeapons,
    "okWeapons" = @okWeapons,
    "message" = @message,
    "visibility" = @visibility
`);

export function upsertSub(args: Omit<Tables["TournamentSub"], "createdAt">) {
	stm.run(args);
}
