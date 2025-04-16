import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { findByInviteCode } from "../queries/findTeamByInviteCode.server";
import { giveTrust } from "../queries/giveTrust.server";
import { joinTeam } from "../queries/joinLeaveTeam.server";
import { joinSchema } from "../tournament-schemas.server";
import { validateCanJoinTeam } from "../tournament-utils";
import { inGameNameIfNeeded } from "../tournament-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const user = await requireUserId(request);
	const url = new URL(request.url);
	const inviteCode = url.searchParams.get("code");
	const data = await parseRequestPayload({ request, schema: joinSchema });
	invariant(inviteCode, "code is missing");

	const leanTeam = notFoundIfFalsy(findByInviteCode(inviteCode));

	const tournament = await tournamentFromDB({ tournamentId, user });

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
			maxTeamSize: tournament.maxTeamMemberCount,
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
					(member) => member.userId === user.id && member.isOwner,
				)
			? "DELETE"
			: "LEAVE";

	joinTeam({
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
		tournamentId,
		inGameName: await inGameNameIfNeeded({
			tournament,
			userId: user.id,
		}),
	});

	ShowcaseTournaments.addToParticipationInfoMap({
		tournamentId,
		type: "participant",
		userId: user.id,
	});

	if (data.trust) {
		const inviterUserId = teamToJoin.members.find(
			(member) => member.isOwner,
		)?.userId;
		invariant(inviterUserId, "Inviter user could not be resolved");
		giveTrust({
			trustGiverUserId: user.id,
			trustReceiverUserId: inviterUserId,
		});
	}

	clearTournamentDataCache(tournamentId);

	throw redirect(tournamentPage(leanTeam.tournamentId));
};
