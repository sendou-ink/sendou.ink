import type { MonthYear } from "$lib/schemas/misc";

export function monthYearToSeasonSpan(monthYear: MonthYear) {
	const date = new Date(monthYear.year, monthYear.month - 1);
	const lastMonth = new Date(date.getFullYear(), date.getMonth(), 0);
	const threeMonthsAgo = new Date(date.getFullYear(), date.getMonth() - 3, 1);

	return {
		from: {
			month: threeMonthsAgo.getMonth() + 1,
			year: threeMonthsAgo.getFullYear(),
		},
		to: {
			month: lastMonth.getMonth() + 1,
			year: lastMonth.getFullYear(),
		},
		value: {
			month: date.getMonth() + 1,
			year: date.getFullYear(),
		},
	};
}
