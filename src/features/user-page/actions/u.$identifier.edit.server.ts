import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { BADGE } from "~/features/badges/badges-constants";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormData } from "~/form/parse.server";
import { userPage } from "~/utils/urls";
import { userEditProfileSchemaServer } from "../user-page-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const result = await parseFormData({
		request,
		schema: userEditProfileSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const [subjectPronoun, objectPronoun] = data.pronouns ?? [null, null];
	const pronouns =
		subjectPronoun && objectPronoun
			? JSON.stringify({ subject: subjectPronoun, object: objectPronoun })
			: null;

	const [motionSens, stickSens] = data.sensitivity ?? [null, null];

	const weapons = data.weapons.map((w) => ({
		weaponSplId: w.id,
		isFavorite: w.isFavorite ? (1 as const) : (0 as const),
	}));

	const isSupporter = user.roles?.includes("SUPPORTER");
	const isArtist = user.roles?.includes("ARTIST");

	const maxBadgeCount = isSupporter
		? BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1
		: 1;
	const limitedBadgeIds = data.favoriteBadgeIds.slice(0, maxBadgeCount);

	const editedUser = await UserRepository.updateProfile({
		userId: user.id,
		country: data.country,
		bio: data.bio,
		customUrl: data.customUrl,
		customName: data.customName,
		motionSens: motionSens !== null ? Number(motionSens) : null,
		stickSens: stickSens !== null ? Number(stickSens) : null,
		pronouns,
		inGameName: data.inGameName,
		battlefy: data.battlefy,
		weapons,
		favoriteBadgeIds: limitedBadgeIds.length > 0 ? limitedBadgeIds : null,
		showDiscordUniqueName: data.showDiscordUniqueName ? 1 : 0,
		commissionsOpen: isArtist && data.commissionsOpen ? 1 : 0,
		commissionText: isArtist ? data.commissionText : null,
	});

	await UserRepository.updatePreferences(user.id, {
		newProfileEnabled: isSupporter ? data.newProfileEnabled : false,
	});

	// TODO: to transaction
	if (data.inGameName) {
		const tournamentIdsAffected =
			await TournamentTeamRepository.updateMemberInGameNameForNonStarted({
				inGameName: data.inGameName,
				userId: user.id,
			});

		for (const tournamentId of tournamentIdsAffected) {
			clearTournamentDataCache(tournamentId);
		}
	}

	throw redirect(userPage(editedUser));
};
