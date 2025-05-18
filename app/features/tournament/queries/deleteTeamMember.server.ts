import { sql } from "~/db/sql";

const stm = sql.prepare(/*sql*/ `
  delete from "TournamentTeamMember"
  where userId = @userId
    and tournamentTeamId = @tournamentTeamId
`);

export default function deleteTeamMember({
	userId,
	tournamentTeamId,
}: {
	userId: number;
	tournamentTeamId: number;
}) {
	stm.run({ userId, tournamentTeamId });
}
