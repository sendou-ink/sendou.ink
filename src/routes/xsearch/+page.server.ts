import * as XRankPlacementRepository from "./x-rank-placement-repository.server";
import { cached } from "$lib/server/utils/cache";

export const load = async ({ url }) => {
	console.log(url.searchParams.get("division")); // note: needed for tracking

	return {
		seasonOptions: seasonOptions(),
	};
};

const seasonOptions = cached("x-search-season-options", () => {
	const seasons = XRankPlacementRepository.findAllAvailableSeasons();

	return seasons.map(({ month, year }) => {
		const date = new Date(year, month - 1);
		const lastMonth = new Date(date.getFullYear(), date.getMonth(), 0);
		const threeMonthsAgo = new Date(date.getFullYear(), date.getMonth() - 3, 1);

		return {
			label: `${threeMonthsAgo.getMonth() + 1}/${threeMonthsAgo.getFullYear()} - ${lastMonth.getMonth() + 1}/${lastMonth.getFullYear()}`,
			value: `${month}-${year}`,
		};
	});
});
