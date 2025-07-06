import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy, parseSafeSearchParams } from "~/utils/remix.server";
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

	return {
		results: await UserRepository.findResultsByUserId(userId, {
			showHighlightsOnly,
		}),
		hasHighlightedResults,
	};
};
