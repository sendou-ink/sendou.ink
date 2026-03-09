import type { LoaderFunctionArgs } from "react-router";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import * as XRankPlacementRepository from "../XRankPlacementRepository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const availableMonthYears = await XRankPlacementRepository.monthYears();
	const { month: latestMonth, year: latestYear } = availableMonthYears[0];

	const url = new URL(request.url);
	const mode = (() => {
		const mode = url.searchParams.get("mode");
		if (rankedModesShort.includes(mode as any)) {
			return mode as RankedModeShort;
		}

		return "SZ";
	})();
	const region = (() => {
		const region = url.searchParams.get("region");
		if (region === "WEST" || region === "JPN") {
			return region;
		}

		return "WEST";
	})();
	const month = (() => {
		const month = url.searchParams.get("month");
		if (month) {
			const monthNumber = Number(month);
			if (monthNumber >= 1 && monthNumber <= 12) {
				return monthNumber;
			}
		}

		return latestMonth;
	})();
	const year = (() => {
		const year = url.searchParams.get("year");
		if (year) {
			const yearNumber = Number(year);
			if (yearNumber >= 2023) {
				return yearNumber;
			}
		}

		return latestYear;
	})();

	const placements = await XRankPlacementRepository.findPlacementsOfMonth({
		mode,
		region,
		month,
		year,
	});

	return {
		placements,
		availableMonthYears,
	};
};
