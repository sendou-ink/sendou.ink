import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { tournamentPage, tournamentRegisterPage } from "~/utils/urls";
import { tournamentJoinSearchParams } from "../tournament-search-params";
import { validateCanJoinTeam } from "../tournament-utils";
import {
	requireNotBannedByOrganization,
	requireSendouQParticipationIfNeeded,
} from "../tournament-utils.server";

export const action: ActionFunction = async ({ params, url }) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);
	const { code: inviteCode } = tournamentJoinSearchParams.parse(url);
	invariant(inviteCode, "code is missing");

	const leanTeam = notFoundIfNullish(
		await TournamentTeamRepository.findByInviteCode(inviteCode),
	);

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
		team.memberUserIds.includes(user.id),
	);

	errorToastIfFalsy(
		!previousTeam,
		"Leave your current team before joining another",
	);

	if (tournament.hasStarted) {
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

	ChatSystemMessage.notifyRoomsChanged([
		...(await TournamentLFGRepository.leaveLfg({
			userId: user.id,
			tournamentId,
		})),
		...(await TournamentTeamRepository.join({
			userId: user.id,
			newTeamId: teamToJoin.id,
		})),
	]);

	ShowcaseTournaments.addToCached({
		tournamentId,
		type: "participant",
		userId: user.id,
	});
	await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

	clearTournamentDataCache(tournamentId);

	throw redirect(
		tournament.registrationOpen
			? tournamentRegisterPage(leanTeam.tournamentId)
			: tournamentPage(leanTeam.tournamentId),
	);
};
