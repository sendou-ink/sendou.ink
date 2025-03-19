import * as XRankPlacementRepository from "./x-rank-placement-repository.server";
import { cached } from "$lib/server/utils/cache";
import * as v from "valibot";
import { Spl3RankedModeSchema, Spl3XRankRegionSchema } from "$lib/schemas/spl3";
import { MonthYearSchema } from "$lib/schemas/misc";

export const load = async ({ url }) => {
	const params = v.safeParse(SearchParamsSchema, {
		mode: url.searchParams.get("mode"),
		region: url.searchParams.get("region"),
		season: url.searchParams.get("season"),
	});

	const entries = params.success
		? await XRankPlacementRepository.findBySeason(params.output)
		: null;

	return {
		seasonOptions: await seasonOptions(),
		entries,
		filters: params.success ? params.output : null,
	};
};

const SearchParamsSchema = v.object({
	mode: Spl3RankedModeSchema,
	region: Spl3XRankRegionSchema,
	season: v.pipe(
		v.string(),
		v.transform((val) => {
			const [month, year] = val.split("-").map(Number);
			return { month, year };
		}),
		MonthYearSchema,
	),
});

const seasonOptions = cached("x-search-season-options", async () => {
	const seasons = await XRankPlacementRepository.allAvailableSeasons();

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
