import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  insert into "TournamentMatchGameResultParticipant"
    ("matchGameResultId", "userId", "tournamentTeamId")
  values
    (@matchGameResultId, @userId, @tournamentTeamId)
`);

export function insertTournamentMatchGameResultParticipant(args: {
	matchGameResultId: number;
	userId: number;
	tournamentTeamId: number;
}) {
	stm.run(args);
}
