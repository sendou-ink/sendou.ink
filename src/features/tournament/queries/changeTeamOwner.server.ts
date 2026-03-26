import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";

const stm = sql.prepare(/* sql */ `
  update TournamentTeamMember
    set "isOwner" = @isOwner
  where
    "tournamentTeamId" = @tournamentTeamId and
      "userId" = @userId
`);

export const changeTeamOwner = sql.transaction(
	(args: {
		tournamentTeamId: Tables["TournamentTeam"]["id"];
		oldCaptainId: Tables["User"]["id"];
		newCaptainId: Tables["User"]["id"];
	}) => {
		stm.run({
			tournamentTeamId: args.tournamentTeamId,
			userId: args.oldCaptainId,
			isOwner: 0,
		});

		stm.run({
			tournamentTeamId: args.tournamentTeamId,
			userId: args.newCaptainId,
			isOwner: 1,
		});
	},
);
