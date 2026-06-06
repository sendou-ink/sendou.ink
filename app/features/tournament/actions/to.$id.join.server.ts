import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
} from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { validateCanJoinTeam } from "../tournament-utils";
import {
	requireNotBannedByOrganization,
	requireSendouQParticipationIfNeeded,
} from "../tournament-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const user = requireUser();
	const url = new URL(request.url);
	const inviteCode = url.searchParams.get("code");
	invariant(inviteCode, "code is missing");

	const leanTeam = notFoundIfFalsy(
		await TournamentTeamRepository.findByInviteCode(inviteCode),
	);

	const tournament = await tournamentFromDB({ tournamentId, user });

	await requireNotBannedByOrganization({
		tournament,
		user,
	});
	await requireSendouQParticipationIfNeeded({
		tournament,
		userId: user.id,
	});

	const teamToJoin = tournament.ctx.teams.find(
		(team) => team.id === leanTeam.id,
	);
	const previousTeam = tournament.ctx.teams.find((team) =>
		team.members.some((member) => member.userId === user.id),
	);

	if (tournament.hasStarted) {
		errorToastIfFalsy(
			!previousTeam || previousTeam.checkIns.length === 0,
			"Can't leave checked in team mid tournament",
		);
		errorToastIfFalsy(tournament.autonomousSubs, "Subs are not allowed");
	} else {
		errorToastIfFalsy(tournament.registrationOpen, "Registration is closed");
	}
	errorToastIfFalsy(teamToJoin, "Not team of this tournament");
	errorToastIfFalsy(
		validateCanJoinTeam({
			inviteCode,
			teamToJoin,
			userId: user.id,
			maxTeamSize: tournament.maxMembersPerTeam,
		}) === "VALID",
		"Cannot join this team or invite code is invalid",
	);
	errorToastIfFalsy(
		(await UserRepository.findLeanById(user.id))?.friendCode,
		"No friend code",
	);

	const whatToDoWithPreviousTeam = !previousTeam
		? undefined
		: previousTeam.members.some(
					(member) => member.userId === user.id && member.role === "OWNER",
				)
			? "DELETE"
			: "LEAVE";

	await TournamentLFGRepository.leaveLfg({ userId: user.id, tournamentId });
	await TournamentTeamRepository.join({
		userId: user.id,
		newTeamId: teamToJoin.id,
		previousTeamId: previousTeam?.id,
		// making sure they aren't unfilling one checking in condition i.e. having full roster
		// and then having members leave without it affecting the checking in status
		checkOutTeam:
			whatToDoWithPreviousTeam === "LEAVE" &&
			previousTeam &&
			previousTeam.members.length <= tournament.minMembersPerTeam,
		whatToDoWithPreviousTeam,
	});

	ShowcaseTournaments.addToCached({
		tournamentId,
		type: "participant",
		userId: user.id,
	});

	clearTournamentDataCache(tournamentId);

	throw redirect(tournamentPage(leanTeam.tournamentId));
};
