import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { imageFieldValueToImgId } from "~/features/img-upload/image-field.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { fieldErrorsFromZodError } from "~/form/parse.server";
import invariant from "~/utils/invariant";
import {
	errorToastIfFalsy,
	formDataToObject,
	parseParams,
} from "~/utils/remix.server";
import { tournamentAdminPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";
import { adminRegistrationFormSchemaServer } from "../tournament-registration-schemas.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();

	// xxx: just use parseFormData
	const rawData: unknown =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());

	const { id: tournamentId } = parseParams({ params, schema: idObject });
	const tournament = await tournamentFromDB({ tournamentId, user });

	errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

	const validation = await adminRegistrationFormSchemaServer({
		tournament,
	}).safeParseAsync(rawData);
	if (!validation.success) {
		return { fieldErrors: fieldErrorsFromZodError(validation.error) };
	}
	const data = validation.data;

	const submittedMembers = data.members;
	const ownerUserId = Number(data.ownerId);

	const linkedTeamId = data.linkedTeam ? data.teamId : null;
	const name = linkedTeamId
		? (await TeamRepository.findById(linkedTeamId))!.name
		: data.pickUpName!;

	// linked teams source their logo from the sendou.ink team, so any pickup avatar is cleared
	const avatarImgId = linkedTeamId
		? null
		: await imageFieldValueToImgId({ value: data.logo, user });

	let team: NonNullable<ReturnType<typeof tournament.teamById>> | undefined;
	if (typeof data.tournamentTeamId === "number") {
		team = tournament.teamById(data.tournamentTeamId);
	}

	const currentMemberIds = team?.members.map((member) => member.userId) ?? [];
	const submittedMemberIds = submittedMembers.map((member) => member.userId);
	const membersToAdd = submittedMemberIds.filter(
		(memberId) => !currentMemberIds.includes(memberId),
	);
	const membersToRemove = currentMemberIds.filter(
		(memberId) => !submittedMemberIds.includes(memberId),
	);

	// xxx: put these to schema
	if (team) {
		for (const removeId of membersToRemove) {
			errorToastIfFalsy(
				!tournament.hasStarted ||
					!tournament
						.participatedPlayersByTeamId(team.id)
						.some((p) => p.userId === removeId),
				"Cannot remove player that has participated in the tournament",
			);
		}

		errorToastIfFalsy(
			team.checkIns.length === 0 ||
				submittedMembers.length >= tournament.minMembersPerTeam,
			"Checked in team can't go below the minimum roster size",
		);
	}

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
		actorUserId: user.id,
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
			newTeamCount:
				!team && addId === ownerUserId
					? tournament.ctx.teams.length + 1
					: undefined,
		});
	}
	for (const removeId of membersToRemove) {
		ShowcaseTournaments.removeFromCached({
			tournamentId,
			type: "participant",
			userId: removeId,
		});
	}

	clearTournamentDataCache(tournamentId);

	return redirect(tournamentAdminPage(tournamentId));
};
