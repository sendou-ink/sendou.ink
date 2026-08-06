import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, paginate } from "~/utils/remix.server";
import {
	HIGHLIGHTS_RESULTS_MAX,
	RESULTS_PER_PAGE,
} from "../user-page-constants";
import { userResultsSearchParams } from "../user-page-search-params";

export type UserResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, request, url }: LoaderFunctionArgs) => {
	const {
		highlightsOnly,
		page,
		tournament,
		team,
		mate,
		minTier,
		maxTier,
		maxPlacement,
		fromYear,
		toYear,
		source,
		minParticipantCount,
	} = userResultsSearchParams.parse(request);

	const userId = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(params.identifier!),
	).id;
	const hasHighlightedResults =
		await UserRepository.hasHighlightedResultsByUserId(userId);

	const isChoosingHighlights = url.pathname.includes("/results/highlights");
	const canFilter = !isChoosingHighlights && Boolean(getUser());

	/** Logged out visitors are locked to the highlights, if there are any. */
	let showHighlightsOnly = hasHighlightedResults;

	if (canFilter && !highlightsOnly) {
		showHighlightsOnly = false;
	}

	if (isChoosingHighlights) {
		showHighlightsOnly = false;
	}

	const filters = canFilter
		? {
				tournamentName: tournament ?? undefined,
				teamName: team ?? undefined,
				mateUserId: mate ?? undefined,
				minTier,
				maxTier,
				maxPlacement: maxPlacement ?? undefined,
				fromYear: fromYear ?? undefined,
				toYear: toYear ?? undefined,
				source,
				minParticipantCount,
			}
		: {};

	const [results, totalCount, mateUsername] = await Promise.all([
		UserRepository.findResultsByUserId(userId, {
			showHighlightsOnly,
			...filters,
			...(isChoosingHighlights
				? { limit: HIGHLIGHTS_RESULTS_MAX }
				: { limit: RESULTS_PER_PAGE, offset: (page - 1) * RESULTS_PER_PAGE }),
		}),
		UserRepository.countResultsByUserId(userId, {
			showHighlightsOnly,
			...filters,
		}),
		filters.mateUserId
			? UserRepository.findUsernameById(filters.mateUserId)
			: null,
	]);

	return {
		results: {
			value: results,
			...paginate({ url, page, pageSize: RESULTS_PER_PAGE, totalCount }),
		},
		hasHighlightedResults,
		mateUsername,
	};
};
