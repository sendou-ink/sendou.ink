import { sql } from "~/db/sql";
import type { TournamentTeam, User } from "~/db/types";

const stm = sql.prepare(/* sql */ `
  update TournamentTeamMember
    set "isOwner" = @isOwner
  where
    "tournamentTeamId" = @tournamentTeamId and
      "userId" = @userId
`);

export const changeTeamOwner = sql.transaction(
	(args: {
		tournamentTeamId: TournamentTeam["id"];
		oldCaptainId: User["id"];
		newCaptainId: User["id"];
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
