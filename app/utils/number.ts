import * as R from "remeda";

/** Rounds to `n` decimal places (default 2). */
export function roundToNDecimalPlaces(num: number, n = 2) {
	return Number((Math.round(num * 10 ** n) / 10 ** n).toFixed(n));
}

/** Truncates to `n` decimal places without rounding, dropping trailing zeros (3.0001 → 3). */
export function cutToNDecimalPlaces(num: number, n = 2) {
	const multiplier = 10 ** n;
	// Round away floating point representation error (e.g. 0.29 * 100 = 28.999...) before truncating
	const scaled = Number((num * multiplier).toFixed(8));
	const truncatedNum = Math.trunc(scaled) / multiplier;
	const result = truncatedNum.toFixed(n);
	return Number(n > 0 ? result.replace(/\.?0+$/, "") : result);
}

/** Arithmetic mean, 0 for an empty array. */
export function averageArray(arr: number[]) {
	if (arr.length === 0) return 0;

	return R.sum(arr) / arr.length;
}

/** Parses a trimmed string into a number; `null` for `null`, empty or non-numeric input. */
export function safeNumberParse(value: string | null) {
	if (value === null) return null;

	const trimmed = value.trim();
	if (trimmed === "") return null;

	const result = Number(trimmed);
	return Number.isNaN(result) ? null : result;
}

/** Share of games won as an unrounded percentage, or `null` when no games were played. */
export function winPercentage(wins: number, losses: number) {
	const played = wins + losses;
	if (played === 0) return null;

	return (wins / played) * 100;
}
