import type {
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { type UserLinkArgs, userBuildsPage, userPage } from "~/utils/urls";
import {
	userBuildsNewSearchParams,
	userSeasonSummaryGraphicSearchParams,
	userSeasonsSearchParams,
} from "./user-page-search-params";

export const userSeasonsPage = ({
	user,
	season,
}: {
	user: UserLinkArgs;
	season?: number;
}) =>
	userSeasonsSearchParams.href(`${userPage(user)}/seasons`, {
		season: season ?? null,
	});

export const userSeasonSummaryGraphicPage = ({
	user,
	season,
}: {
	user: UserLinkArgs;
	season: number;
}) =>
	userSeasonSummaryGraphicSearchParams.href(
		`${userPage(user)}/seasons/summary-graphic`,
		{ season },
	);

export const userSeasonsStatsPage = ({
	user,
	season,
	info,
}: {
	user: UserLinkArgs;
	season?: number;
	info?: "weapons" | "stages" | "mates" | "enemies";
}) =>
	userSeasonsSearchParams.href(`${userPage(user)}/seasons/stats`, {
		...(info ? { info } : {}),
		season: season ?? null,
	});

export const userNewBuildPage = (
	user: UserLinkArgs,
	params?: { weapon: MainWeaponId; build: BuildAbilitiesTupleWithUnknown },
) =>
	params
		? userBuildsNewSearchParams.href(`${userBuildsPage(user)}/new`, {
				weapon: params.weapon,
				build: params.build,
			})
		: `${userBuildsPage(user)}/new`;
