/**
 * List of seasons with their respective start and end dates.
 *
 * Each season is represented as an object with the following properties:
 * - `nth`: The sequential number of the season (starting from 0).
 * - `starts`: The start date of the season as a `Date` object.
 * - `ends`: The end date of the season as a `Date` object.
 *
 * Note: The value is conditionally set based on the environment. In development mode,
 * the end date of the first season is set to a later date for testing purposes (ensures a season is always open).
 *
 * @example
 * console.log(Seasons.list[0].starts); // Logs the start date of the first season
 */
export const list =
	process.env.NODE_ENV === "development" &&
	import.meta.env.VITE_PROD_MODE !== "true"
		? ([
				{
					nth: 0,
					starts: new Date("2023-08-14T17:00:00.000Z"),
					ends: new Date("2023-08-27T20:59:59.999Z"),
				},
				{
					nth: 1,
					starts: new Date("2023-09-11T17:00:00.000Z"),
					ends: new Date("2030-11-17T20:59:59.999Z"),
				},
			] as const)
		: ([
				{
					nth: 0,
					starts: new Date("2023-08-14T17:00:00.000Z"),
					ends: new Date("2023-08-27T20:59:59.999Z"),
				},
				{
					nth: 1,
					starts: new Date("2023-09-11T17:00:00.000Z"),
					ends: new Date("2023-11-19T20:59:59.999Z"),
				},
				{
					nth: 2,
					starts: new Date("2023-12-04T17:00:00.000Z"),
					ends: new Date("2024-02-18T20:59:59.999Z"),
				},
				{
					nth: 3,
					starts: new Date("2024-03-04T17:00:00.000Z"),
					ends: new Date("2024-05-19T20:59:59.999Z"),
				},
				{
					nth: 4,
					starts: new Date("2024-06-03T17:00:00.000Z"),
					ends: new Date("2024-08-18T20:59:59.999Z"),
				},
				{
					nth: 5,
					starts: new Date("2024-09-02T17:00:00.000Z"),
					ends: new Date("2024-11-17T22:59:59.999Z"),
				},
				{
					nth: 6,
					starts: new Date("2024-12-02T18:00:00.000Z"),
					ends: new Date("2025-02-16T21:59:59.999Z"),
				},
				{
					nth: 7,
					starts: new Date("2025-03-07T18:00:00.000Z"),
					ends: new Date("2025-05-25T21:59:59.999Z"),
				},
			] as const);

/**
 * Represents an individual item from the `Seasons.list` array.
 */
export type ListItem = (typeof list)[number];

/**
 * Determines the current season relative to the provided date (defaults to now), or falls back to the previous season if no current season is found.
 *
 * @returns The current season if it exists; otherwise, the previous season.
 */
export function currentOrPrevious(date = new Date()): ListItem | null {
	const _currentSeason = current(date);
	if (_currentSeason) return _currentSeason;

	return previous(date);
}

/**
 * Determines the previous season relative to the provided date (defaults to now).
 *
 * @returns The previous season if one exists.
 */
export function previous(date = new Date()): ListItem | null {
	let latestPreviousSeason: ListItem | null = null;
	for (const season of list) {
		if (date > season.ends) latestPreviousSeason = season;
	}

	return latestPreviousSeason;
}

/**
 * Determines the current ongoing season relative to the provided date (defaults to now).
 *
 * @returns The current season if one exists.
 */
export function current(date = new Date()): ListItem | null {
	for (const season of list) {
		if (date >= season.starts && date <= season.ends) return season;
	}

	return null;
}

/**
 * Determines the next upcoming season relative to the provided date (defaults to now).
 *
 * @returns The next season if one exists.
 */
export function next(date = new Date()): ListItem | null {
	for (const season of list) {
		if (date < season.starts) return season;
	}

	return null;
}

/**
 * Retrieves the date range for a specific season based on its number.
 *
 * @returns An object containing the start and end dates of the specified season.
 * @throws {Error} If the season does not exist.
 */
export function nthToDateRange(nth: number) {
	const seasonObject = list.at(nth);
	if (!seasonObject) {
		throw new Error(`Season ${nth} not found`);
	}

	return {
		starts: seasonObject.starts,
		ends: seasonObject.ends,
	};
}

/**
 * Retrieves a list of season numbers that have started based on the provided date (defaults to now).
 *
 * @returns An array of season numbers in asceding order. If no seasons have started, returns an array containing only `[0]`.
 */
export function allStarted(date = new Date()) {
	const startedSeasons = list.filter((s) => date >= s.starts);
	if (startedSeasons.length > 0) {
		return startedSeasons.map((s) => s.nth).reverse();
	}

	return [0];
}
