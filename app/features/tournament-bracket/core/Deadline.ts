const PREP_TIME_MINUTES = 6.5;
const MINUTES_PER_GAME = 6.5;

/**
 * Acceptable max duration of a match in minutes (preparation time + game time).
 * @internal
 */
export function totalMatchTime(maxGamesCount: number): number {
	return PREP_TIME_MINUTES + MINUTES_PER_GAME * maxGamesCount;
}

/** "normal" if on track, "warning" if behind schedule, "error" if overtime. */
export function matchStatus({
	elapsedMinutes,
	gamesCompleted,
	maxGamesCount,
}: {
	elapsedMinutes: number;
	gamesCompleted: number;
	maxGamesCount: number;
}): "normal" | "warning" | "error" {
	const totalMinutes = totalMatchTime(maxGamesCount);

	if (elapsedMinutes >= totalMinutes) {
		return "error";
	}

	const expectedGames = expectedGamesCompletedByMinute(
		elapsedMinutes,
		maxGamesCount,
	);

	if (gamesCompleted < expectedGames) {
		return "warning";
	}

	return "normal";
}

function expectedGamesCompletedByMinute(
	elapsedMinutes: number,
	maxGamesCount: number,
): number {
	const gameTimeElapsed = elapsedMinutes - PREP_TIME_MINUTES;

	if (gameTimeElapsed <= 0) {
		return 0;
	}

	const expectedGames = Math.floor(gameTimeElapsed / MINUTES_PER_GAME);
	return Math.min(expectedGames, maxGamesCount);
}
