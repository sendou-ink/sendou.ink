import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import {
	notFoundIfFalsy,
	parseSafeSearchParams,
	redirectIfPageOutOfBounds,
} from "~/utils/remix.server";
import {
	HIGHLIGHTS_RESULTS_MAX,
	RESULTS_PER_PAGE,
} from "../user-page-constants";
import { userResultsPageSearchParamsSchema } from "../user-page-schemas";

export type UserResultsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const parsedSearchParams = parseSafeSearchParams({
		request,
		schema: userResultsPageSearchParamsSchema,
	});

	const userId = notFoundIfFalsy(
		await UserRepository.identifierToUserId(params.identifier!),
	).id;
	const hasHighlightedResults =
		await UserRepository.hasHighlightedResultsByUserId(userId);

	let showHighlightsOnly = parsedSearchParams.success
		? !parsedSearchParams.data.all
		: true;

	if (!hasHighlightedResults) {
		showHighlightsOnly = false;
	}

	const isChoosingHighlights = request.url.includes("/results/highlights");
	if (isChoosingHighlights) {
		showHighlightsOnly = false;
	}

	const page = parsedSearchParams.success ? parsedSearchParams.data.page : 1;
	const tournamentName =
		!isChoosingHighlights && getUser() && parsedSearchParams.success
			? parsedSearchParams.data.tournament
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

	const pagesCount = Math.ceil(totalCount / RESULTS_PER_PAGE);

	redirectIfPageOutOfBounds({ request, page, pagesCount });

	return {
		results: {
			value: results,
			currentPage: page,
			pages: pagesCount,
		},
		hasHighlightedResults,
	};
};
