import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import invariant from "~/utils/invariant";
import { errorToastIfFalsy, parseParams } from "~/utils/remix.server";
import { tournamentAdminPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { adminRegistrationFormSchemaServer } from "../tournament-admin-registration-schemas.server";
import { requireTournamentOrganizer } from "../tournament-admin-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({ params, schema: idObject });
	const tournament = await tournamentFromDB({ tournamentId, user });

	requireTournamentOrganizer(tournament, user);

	const result = await parseFormDataWithImages({
		request,
		schema: adminRegistrationFormSchemaServer({ tournament }),
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const data = result.data;

	const submittedMembers = data.members;
	const ownerUserId = Number(data.ownerId);

	const linkedTeamId = data.linkedTeam ? data.teamId : null;
	const name = linkedTeamId
		? (await TeamRepository.findById(linkedTeamId))!.name
		: data.pickUpName!;

	// linked teams source their logo from the sendou.ink team, so any pickup avatar is cleared
	const avatarImgId = linkedTeamId ? null : data.logo;

	let team: NonNullable<ReturnType<typeof tournament.teamById>> | undefined;
	if (typeof data.tournamentTeamId === "number") {
		team = tournament.teamById(data.tournamentTeamId);
	}

	errorToastIfFalsy(team || !tournament.hasStarted, "Tournament has started");

	const currentMemberIds = team?.members.map((member) => member.userId) ?? [];
	const submittedMemberIds = submittedMembers.map((member) => member.userId);
	const membersToAdd = submittedMemberIds.filter(
		(memberId) => !currentMemberIds.includes(memberId),
	);
	const membersToRemove = currentMemberIds.filter(
		(memberId) => !submittedMemberIds.includes(memberId),
	);

	const ownerChange = (() => {
		if (!team) return null;
		const currentOwner = team.members.find((m) => m.role === "OWNER");
		invariant(currentOwner, "Team has no owner");
		return currentOwner.userId !== ownerUserId
			? { oldOwnerId: currentOwner.userId, newOwnerId: ownerUserId }
			: null;
	})();

	const inGameNameUpdates = submittedMembers.flatMap((member) => {
		if (!member.inGameName) return [];
		const current = team?.members.find((m) => m.userId === member.userId);
		if (current && current.inGameName === member.inGameName) return [];
		return [{ userId: member.userId, inGameName: member.inGameName }];
	});

	await TournamentTeamRepository.upsertRegistration({
		tournamentTeamId: team?.id,
		tournamentId,
		name,
		teamId: linkedTeamId,
		avatarImgId,
		ownerUserId,
		ownerChange,
		membersToAdd,
		membersToRemove,
		inGameNameUpdates,
	});

	for (const addId of membersToAdd) {
		await TournamentLFGRepository.leaveLfg({
			userId: addId,
			tournamentId,
		});
		ShowcaseTournaments.addToCached({
			tournamentId,
			type: "participant",
			userId: addId,
		});
	}
	for (const removeId of membersToRemove) {
		ShowcaseTournaments.removeFromCached({
			tournamentId,
			type: "participant",
			userId: removeId,
		});
	}

	if (
		team &&
		membersToAdd.length > 0 &&
		!tournament.isTest &&
		!tournament.isDraft
	) {
		notify({
			userIds: membersToAdd,
			notification: {
				type: "TO_ADDED_TO_TEAM",
				pictureUrl:
					tournament.tournamentTeamLogoSrc(team) ?? tournament.ctx.logoUrl,
				meta: {
					adderUsername: user.username,
					teamName: name,
					tournamentId,
					tournamentName: tournament.ctx.name,
					tournamentTeamId: team.id,
				},
			},
		});
	}

	if (!team) {
		ShowcaseTournaments.updateCachedTournamentTeamCount({
			tournamentId,
			newTeamCount: tournament.ctx.teams.length + 1,
		});
	}

	clearTournamentDataCache(tournamentId);

	return redirect(tournamentAdminPage(tournamentId));
};
