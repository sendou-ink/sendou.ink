import {
	type ActionFunction,
	type ActionFunctionArgs,
	redirect,
} from "react-router";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { notify } from "~/features/notifications/core/notify.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { syncPickupChatMetadata } from "~/features/tournament-lfg/tournament-lfg-utils.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { tournamentAdminPage } from "~/utils/urls";
import { adminRegistrationFormSchemaServer } from "../tournament-admin-registration-schemas.server";

export const action: ActionFunction = (args) =>
	upsertRegistrationAction(args, { allowTournamentNameUpdates: true });

/**
 * The registration upsert itself, shared with the public API's version of this
 * endpoint. That one passes `allowTournamentNameUpdates: false`: tournament names
 * are the admin form's business and the API can only read them.
 */
export const upsertRegistrationAction = async (
	{ request, params }: ActionFunctionArgs,
	{ allowTournamentNameUpdates }: { allowTournamentNameUpdates: boolean },
) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "organizer" },
	);

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

	const team =
		typeof data.tournamentTeamId === "number"
			? (
					await TournamentRepository.findTeamsFullByTournamentId(tournamentId)
				).find((t) => t.id === data.tournamentTeamId)
			: undefined;

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

	// only a submission from someone allowed to edit tournament names says anything
	// about them, everyone else leaves the names the players have untouched
	const tournamentNameUpdates =
		allowTournamentNameUpdates && tournament.canEditTournamentNames(user)
			? submittedMembers.map((member) => ({
					userId: member.userId,
					tournamentName: member.tournamentName ?? null,
				}))
			: [];

	// the map pool field is only shown while it can still be changed, so a submission
	// from any other state says nothing about the pool the team has
	const mapPool =
		tournament.teamsPrePickMaps && !tournament.hasStarted
			? new MapPool(data.mapPool)
			: undefined;

	const { appliedTournamentNameChanges } =
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
			tournamentNameUpdates,
			mapPool,
		});

	for (const change of appliedTournamentNameChanges) {
		logger.info(
			`Tournament name updated: subject user id: ${change.userId} - "${change.previousTournamentName ?? ""}" -> "${change.tournamentName ?? ""}" - by user id: ${user.id} - tournament id: ${tournamentId}`,
		);
	}

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

	if (team && (membersToAdd.length > 0 || membersToRemove.length > 0)) {
		await syncPickupChatMetadata({
			teamId: team.id,
			tournament: {
				id: tournamentId,
				name: tournament.ctx.name,
				logoUrl: tournament.ctx.logoUrl,
				startTime: tournament.ctx.startsAt,
			},
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
					team.team?.logoUrl ?? team.pickupAvatarUrl ?? tournament.ctx.logoUrl,
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

	await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

	clearTournamentDataCache(tournamentId);

	return redirect(tournamentAdminPage(tournamentId));
};
