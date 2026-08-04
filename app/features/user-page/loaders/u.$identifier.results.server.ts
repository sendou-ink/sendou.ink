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
	const { all, page, tournament } = userResultsSearchParams.parse(request);

	const userId = notFoundIfNullish(
		await UserRepository.findIdByIdentifier(params.identifier!),
	).id;
	const hasHighlightedResults =
		await UserRepository.hasHighlightedResultsByUserId(userId);

	let showHighlightsOnly = !all;

	if (!hasHighlightedResults) {
		showHighlightsOnly = false;
	}

	const isChoosingHighlights = url.pathname.includes("/results/highlights");
	if (isChoosingHighlights) {
		showHighlightsOnly = false;
	}

	const tournamentName =
		!isChoosingHighlights && getUser() && tournament !== null
			? tournament
			: undefined;

	const [results, totalCount] = await Promise.all([
		UserRepository.findResultsByUserId(userId, {
			showHighlightsOnly,
			tournamentName,
			...(isChoosingHighlights
				? { limit: HIGHLIGHTS_RESULTS_MAX }
				: { limit: RESULTS_PER_PAGE, offset: (page - 1) * RESULTS_PER_PAGE }),
		}),
		UserRepository.countResultsByUserId(userId, {
			showHighlightsOnly,
			tournamentName,
		}),
	]);

	return {
		results: {
			value: results,
			...paginate({ url, page, pageSize: RESULTS_PER_PAGE, totalCount }),
		},
		hasHighlightedResults,
	};
};
