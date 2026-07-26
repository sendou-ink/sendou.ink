export type SwissTeamStatus = "active" | "advanced" | "eliminated";

/**
 * Calculates whether a team should advance, be eliminated, or remain active
 * in a Swiss tournament with early advance/elimination rules.
 *
 * @returns The team's status: "advanced" if they've secured advancement,
 *          "eliminated" if they can no longer mathematically advance, or "active" if still competing
 *
 * @example
 * // In a 5-round Swiss where teams need 3 wins to advance:
 * calculateTeamStatus({ wins: 3, losses: 1, advanceThreshold: 3, roundCount: 5 }) // "advanced"
 * calculateTeamStatus({ wins: 2, losses: 3, advanceThreshold: 3, roundCount: 5 }) // "eliminated"
 * calculateTeamStatus({ wins: 2, losses: 2, advanceThreshold: 3, roundCount: 5 }) // "active"
 */
export function calculateTeamStatus({
	wins,
	losses,
	advanceThreshold,
	roundCount,
}: {
	/** Number of matches the team has won */
	wins: number;
	/** Number of matches the team has lost */
	losses: number;
	/** Number of wins required to advance to the next stage */
	advanceThreshold: number;
	/** Total number of rounds in the Swiss stage */
	roundCount: number;
}): SwissTeamStatus {
	if (wins >= advanceThreshold) {
		return "advanced";
	}

	if (losses >= eliminationThreshold({ roundCount, advanceThreshold })) {
		return "eliminated";
	}

	return "active";
}

/**
 * Calculates the maximum valid advance threshold for a given round count.
 * The threshold must allow for meaningful play - teams need a chance to both advance and be eliminated.
 */
export function maxAdvanceThreshold({ roundCount }: { roundCount: number }) {
	return Math.ceil(roundCount / 2) + 1;
}

/**
 * Calculates the maximum losses allowed before elimination given an advance threshold and round count.
 */
export function eliminationThreshold({
	roundCount,
	advanceThreshold,
}: {
	roundCount: number;
	advanceThreshold: number;
}) {
	return roundCount - advanceThreshold + 1;
}

/**
 * Validates if an advance threshold is valid for the given round count.
 */
export function isValidAdvanceThreshold({
	roundCount,
	advanceThreshold,
}: {
	roundCount: number;
	advanceThreshold: number;
}) {
	return validAdvanceThresholdOptions({ roundCount }).includes(
		advanceThreshold,
	);
}

/**
 * Returns a list of valid advance threshold options for a given round count.
 * Starts from 2 wins minimum up to the calculated maximum.
 */
export function validAdvanceThresholdOptions({
	roundCount,
}: {
	roundCount: number;
}) {
	const result: number[] = [];

	for (let i = 2; i <= maxAdvanceThreshold({ roundCount }); i++) {
		result.push(i);
	}

	return result;
}
