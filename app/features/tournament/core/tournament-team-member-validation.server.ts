import { err, ok } from "neverthrow";
import { userIsBanned } from "~/features/ban/core/banned.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

export function validateAddMember({
	tournament,
	teamId,
	userId,
}: {
	tournament: Tournament;
	teamId: number;
	userId: number;
}) {
	const team = tournament.teamById(teamId);
	if (!team) {
		return err("Invalid team id");
	}

	const previousTeam = tournament.teamMemberOfByUser({ id: userId });

	if (previousTeam?.id === team.id) {
		return err("User is already in this team");
	}

	if (!tournament.hasStarted && previousTeam) {
		return err("User is already in a team");
	}

	if (userIsBanned(userId)) {
		return err(
			"User trying to be added currently has an active ban from sendou.ink",
		);
	}

	return ok({ team, previousTeam });
}

export function validateRemoveMember({
	tournament,
	teamId,
	memberId,
}: {
	tournament: Tournament;
	teamId: number;
	memberId: number;
}) {
	const team = tournament.teamById(teamId);
	if (!team) {
		return err("Invalid team id");
	}

	if (
		team.checkIns.length > 0 &&
		team.members.length <= tournament.minMembersPerTeam
	) {
		return err("Can't remove last member from checked in team");
	}

	const member = team.members.find((m) => m.userId === memberId);
	if (member?.isOwner) {
		return err("Cannot remove team owner");
	}

	if (
		tournament.hasStarted &&
		tournament
			.participatedPlayersByTeamId(teamId)
			.some((p) => p.userId === memberId)
	) {
		return err("Cannot remove player that has participated in the tournament");
	}

	return ok({ team });
}
