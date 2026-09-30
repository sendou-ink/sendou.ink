import type { LoaderFunctionArgs } from "react-router";
import { topSearchSearchParams } from "../top-search-search-params";
import * as XRankPlacementRepository from "../XRankPlacementRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const availableMonthYears =
		await XRankPlacementRepository.findAllMonthYears();
	const { month: latestMonth, year: latestYear } = availableMonthYears[0];

	const { mode, region, month, year } = topSearchSearchParams.parse(request);

	const placements = await XRankPlacementRepository.findPlacementsOfMonth({
		mode,
		region,
		month: month ?? latestMonth,
		year: year ?? latestYear,
	});

	return {
		placements,
		availableMonthYears,
	};
};
