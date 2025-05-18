import { sql } from "~/db/sql";
import { deleteSub } from "~/features/tournament-subs";
import invariant from "~/utils/invariant";
import { checkOut } from "./checkOut.server";

const createTeamMemberStm = sql.prepare(/*sql*/ `
  insert into "TournamentTeamMember" (
    "tournamentTeamId",
    "inGameName",
    "userId"
  ) values (
    @tournamentTeamId,
    @inGameName,
    @userId
  )
`);

const deleteTeamStm = sql.prepare(/*sql*/ `
  delete from "TournamentTeam"
    where "id" = @tournamentTeamId  
`);

const deleteMemberStm = sql.prepare(/*sql*/ `
  delete from "TournamentTeamMember"
  where "tournamentTeamId" = @tournamentTeamId
    and "userId" = @userId
`);

// TODO: if captain leaves don't delete but give captain to someone else
export const joinTeam = sql.transaction(
	({
		previousTeamId,
		whatToDoWithPreviousTeam,
		newTeamId,
		userId,
		inGameName,
		tournamentId,
		checkOutTeam = false,
	}: {
		previousTeamId?: number;
		whatToDoWithPreviousTeam?: "LEAVE" | "DELETE";
		newTeamId: number;
		userId: number;
		inGameName: string | null;
		tournamentId: number;
		checkOutTeam?: boolean;
	}) => {
		if (whatToDoWithPreviousTeam === "DELETE") {
			deleteTeamStm.run({ tournamentTeamId: previousTeamId ?? null });
		} else if (whatToDoWithPreviousTeam === "LEAVE") {
			deleteMemberStm.run({ tournamentTeamId: previousTeamId ?? null, userId });
		}

		if (!previousTeamId) {
			deleteSub({ tournamentId, userId });
		}

		if (checkOutTeam) {
			invariant(
				previousTeamId,
				"previousTeamId is required when checking out team",
			);
			checkOut(previousTeamId);
		}

		createTeamMemberStm.run({
			tournamentTeamId: newTeamId,
			userId,
			inGameName,
		});
	},
);

export const leaveTeam = ({
	teamId,
	userId,
}: {
	teamId: number;
	userId: number;
}) => {
	deleteMemberStm.run({ tournamentTeamId: teamId, userId });
};
