import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { BADGE } from "~/features/badges/badges-constants";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { userPage } from "~/utils/urls";
import { userEditProfileBaseSchema } from "../user-page-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const result = await parseFormDataWithImages({
		request,
		schema: userEditProfileBaseSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	if (data.customUrl) {
		const existingUser = await UserRepository.findByCustomUrl(data.customUrl);
		if (existingUser && existingUser.id !== user.id) {
			return {
				fieldErrors: {
					customUrl: "forms:errors.profileCustomUrlDuplicate",
				},
			};
		}
	}

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

	const editedUser = await UserRepository.updateOwnProfile({
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
		customAvatarImgId: isSupporter ? data.customAvatar : null,
	});

	await UserRepository.updateOwnPreferences({
		newProfileEnabled: isSupporter ? data.newProfileEnabled : false,
	});

	// TODO: to transaction
	if (data.inGameName) {
		const tournamentIdsAffected =
			await TournamentTeamRepository.updateOwnMemberInGameNameForNonStarted(
				data.inGameName,
			);

		for (const tournamentId of tournamentIdsAffected) {
			clearTournamentDataCache(tournamentId);
		}
	}

	throw redirect(userPage(editedUser));
};
