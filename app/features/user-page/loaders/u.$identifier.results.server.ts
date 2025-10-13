import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy, parseSafeSearchParams } from "~/utils/remix.server";
import { RESULTS_PER_PAGE } from "../user-page-constants";
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

	const page = parsedSearchParams.success
		? (parsedSearchParams.data.page ?? 1)
		: 1;

	const [results, totalCount] = await Promise.all([
		UserRepository.findResultsByUserId(userId, {
			showHighlightsOnly,
			...(isChoosingHighlights
				? {}
				: { limit: RESULTS_PER_PAGE, offset: (page - 1) * RESULTS_PER_PAGE }),
		}),
		UserRepository.countResultsByUserId(userId, { showHighlightsOnly }),
	]);

	const maxPage = Math.ceil(totalCount / RESULTS_PER_PAGE);
	if (page > maxPage && page !== 1) {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const searchParams = url.searchParams;
		searchParams.set("page", String(maxPage));
		return redirect(`${pathname}?${searchParams.toString()}`);
	}

	return {
		results: {
			value: results,
			currentPage: page,
			pages: maxPage,
		},
		hasHighlightedResults,
	};
};
