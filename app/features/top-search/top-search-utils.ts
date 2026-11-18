export type MonthYear = {
	month: number;
	year: number;
};

/** First and last month of the X Rank season that ended before the given month. */
export function monthYearToSpan(monthYear: MonthYear): {
	from: Date;
	to: Date;
} {
	return {
		from: new Date(monthYear.year, monthYear.month - 4, 1),
		to: new Date(monthYear.year, monthYear.month - 2, 1),
	};
}
