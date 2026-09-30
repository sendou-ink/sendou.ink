import type {
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { type UserLinkArgs, userBuildsPage, userPage } from "~/utils/urls";
import type { SeasonStatsTab } from "./user-page-constants";
import {
	userBuildsNewSearchParams,
	userSeasonSummaryGraphicSearchParams,
	userSeasonsSearchParams,
	userSeasonsStatsSearchParams,
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
	tab,
}: {
	user: UserLinkArgs;
	season?: number;
	tab?: SeasonStatsTab;
}) =>
	userSeasonsStatsSearchParams.href(`${userPage(user)}/seasons/stats`, {
		...(tab ? { tab } : {}),
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

/**
 * Path the given user page URL should redirect to, or `null` if it already uses the user's
 * preferred identifier (custom URL, falling back to their Discord id).
 */
export function userPageRedirectPath(url: URL, user: UserLinkArgs) {
	const segments = url.pathname.split("/");
	const preferredIdentifier = user.customUrl ?? user.discordId;

	if (segments[2] === preferredIdentifier) return null;

	segments[2] = preferredIdentifier;

	return `${segments.join("/")}${url.search}`;
}
