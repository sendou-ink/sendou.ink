import { type ActionFunction, redirect } from "react-router";
import * as R from "remeda";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "~/features/trophies/trophies-constants";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { userPage } from "~/utils/urls";
import { SUBJECT_PRONOUNS } from "../user-page-constants";
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
		const existingUser = await UserRepository.findOneBy({
			customUrl: data.customUrl,
		});
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
		subjectPronoun &&
		objectPronoun &&
		R.isIncludedIn(subjectPronoun, SUBJECT_PRONOUNS)
			? { subject: subjectPronoun, object: objectPronoun }
			: null;

	const isSupporter = user.roles?.includes("SUPPORTER");
	const isArtist = user.roles?.includes("ARTIST");

	const hiddenTrophySet = new Set(data.hiddenTrophyIds);
	const limitedTrophyIds = isSupporter
		? data.favoriteTrophyIds
				.filter((id) => !hiddenTrophySet.has(id))
				.slice(0, SMALL_TROPHIES_PER_DISPLAY_PAGE)
		: [];

	await UserRepository.updateOwnProfile({
		country: data.country,
		customUrl: data.customUrl,
		customName: data.customName,
		pronouns,
		inGameName: data.inGameName,
		favoriteTrophyIds: limitedTrophyIds.length > 0 ? limitedTrophyIds : null,
		hiddenTrophyIds:
			data.hiddenTrophyIds.length > 0 ? data.hiddenTrophyIds : null,
		commissionsOpen: isArtist && data.commissionsOpen,
		commissionText: isArtist ? data.commissionText : null,
		customAvatarImgId: isSupporter ? data.customAvatar : null,
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

	throw redirect(
		userPage({ discordId: user.discordId, customUrl: data.customUrl }),
	);
};
