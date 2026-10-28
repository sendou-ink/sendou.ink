import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import * as TranslationCatalog from "~/features/translate/core/TranslationCatalog.server";

const WIN_RATE_SEASONS_COUNT = 4;

export const loader = async (_args: LoaderFunctionArgs) => {
	const user = getUser();
	const translationProgress = TranslationCatalog.progressByLanguage();

	if (!user) {
		return { matchProfile: null, mapResults: null, translationProgress };
	}

	const matchProfile = await MatchProfileRepository.findSettingsByUserId(
		user.id,
	);
	const mapResults =
		await PlayerStatRepository.findMapResultsByUserIdAndSeasons({
			userId: user.id,
			seasons: winRateSeasons(),
		});

	return { matchProfile, mapResults, translationProgress };
};

function winRateSeasons() {
	return Seasons.allStarted().slice(0, WIN_RATE_SEASONS_COUNT);
}
