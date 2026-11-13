const NICE_STEP_MULTIPLIERS = [1, 2, 5, 10];

/** Truncates to `n` decimal places without rounding, dropping trailing zeros (3.0001 → 3). */
export function cutToNDecimalPlaces(num: number, n = 2) {
	const multiplier = 10 ** n;
	// Round away floating point representation error (e.g. 0.29 * 100 = 28.999...) before truncating
	const scaled = Number((num * multiplier).toFixed(8));
	const truncatedNum = Math.trunc(scaled) / multiplier;
	const result = truncatedNum.toFixed(n);
	return Number(n > 0 ? result.replace(/\.?0+$/, "") : result);
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

/** Smallest round step (1, 2 or 5 times a power of ten) at or above `roughStep`, for spacing axis ticks. */
export function niceStep(roughStep: number) {
	const magnitude = 10 ** Math.floor(Math.log10(roughStep));

	return (
		(NICE_STEP_MULTIPLIERS.find(
			(multiplier) => multiplier * magnitude >= roughStep,
		) ?? 10) * magnitude
	);
}

/** The middle value of `values` (the mean of the two middle ones for an even count), or 0 when there are none. */
export function median(values: readonly number[]) {
	if (values.length === 0) return 0;
	const sorted = values.toSorted((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1
		? sorted[mid]!
		: (sorted[mid - 1]! + sorted[mid]!) / 2;
}
