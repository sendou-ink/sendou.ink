const PREP_TIME_MINUTES = 7;
const MINUTES_PER_GAME = 7;

/**
 * Calculates the max duration for a match considered acceptable.
 * @param maxGamesCount - The maximum number of games in the match
 * @returns Time in minutes (preparation time + game time)
 */
export function totalMatchTime(maxGamesCount: number): number {
	return PREP_TIME_MINUTES + MINUTES_PER_GAME * maxGamesCount;
}

/**
 * Calculates the progress percentage based on elapsed time.
 * @param elapsedMinutes - Time elapsed since match start
 * @param totalMinutes - Total expected match duration
 * @returns Percentage value (0-100+)
 */
export function progressPercentage(
	elapsedMinutes: number,
	totalMinutes: number,
): number {
	return (elapsedMinutes / totalMinutes) * 100;
}

/**
 * Generates marker positions for each game in the match timeline.
 * @param maxGamesCount - The maximum number of games in the match
 * @returns Array of game markers with their position as a percentage
 */
export function gameMarkers(
	maxGamesCount: number,
): Array<{ gameNumber: number; percentage: number; gameStartMinute: number }> {
	const totalMinutes = totalMatchTime(maxGamesCount);
	const markers = [];

	for (let i = 1; i <= maxGamesCount; i++) {
		const gameStartMinute = PREP_TIME_MINUTES + MINUTES_PER_GAME * (i - 1);
		const percentage = (gameStartMinute / totalMinutes) * 100;

		markers.push({
			gameNumber: i,
			percentage: Math.min(percentage, 100),
			gameStartMinute,
		});
	}

	return markers;
}

/**
 * Determines the current status of a match based on time and progress.
 * @param params - Object containing elapsed time, games completed, and max games
 * @returns "normal" if on track, "warning" if behind schedule, "error" if overtime
 */
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
