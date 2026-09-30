export type SwissTeamStatus = "active" | "advanced" | "eliminated";

/**
 * Swiss early advance/elimination: "advanced" once the threshold is reached, "eliminated" when it can
 * no longer be reached, otherwise "active".
 */
export function calculateTeamStatus({
	wins,
	losses,
	advanceThreshold,
	roundCount,
}: {
	wins: number;
	losses: number;
	/** Wins required to advance */
	advanceThreshold: number;
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

/** Teams need a chance to both advance and be eliminated. */
export function maxAdvanceThreshold({ roundCount }: { roundCount: number }) {
	return Math.ceil(roundCount / 2) + 1;
}

/** Losses that eliminate a team. */
export function eliminationThreshold({
	roundCount,
	advanceThreshold,
}: {
	roundCount: number;
	advanceThreshold: number;
}) {
	return roundCount - advanceThreshold + 1;
}

/** Whether the advance threshold is valid for the round count. */
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

/** From 2 wins up to {@link maxAdvanceThreshold}. */
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
