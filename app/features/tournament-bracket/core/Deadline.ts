const PREP_TIME_MINUTES = 6.5;
const MINUTES_PER_GAME = 6.5;

/** Acceptable max duration of a match in minutes (preparation time + game time). */
export function totalMatchTime(maxGamesCount: number): number {
	return PREP_TIME_MINUTES + MINUTES_PER_GAME * maxGamesCount;
}

/** Elapsed share of the expected duration as a percentage (0-100+). */
export function progressPercentage(
	elapsedMinutes: number,
	totalMinutes: number,
): number {
	return (elapsedMinutes / totalMinutes) * 100;
}

/** Position of each game on the match timeline as a percentage. */
export function gameMarkers(maxGamesCount: number): Array<{
	gameNumber: number;
	percentage: number;
	gameStartMinute: number;
	maxMinute: number;
}> {
	const totalMinutes = totalMatchTime(maxGamesCount);
	const markers = [];

	for (let i = 1; i <= maxGamesCount; i++) {
		const gameStartMinute = PREP_TIME_MINUTES + MINUTES_PER_GAME * (i - 1);
		const maxMinute = PREP_TIME_MINUTES + MINUTES_PER_GAME * i;
		const percentage = (gameStartMinute / totalMinutes) * 100;

		markers.push({
			gameNumber: i,
			percentage: Math.min(percentage, 100),
			gameStartMinute,
			maxMinute,
		});
	}

	return markers;
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
