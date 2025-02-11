export const SEASONS =
	process.env.NODE_ENV === "development"
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
			] as const);

export type RankingSeason = (typeof SEASONS)[number];

export function currentOrPreviousSeason(date: Date) {
	const _currentSeason = currentSeason(date);
	if (_currentSeason) return _currentSeason;

	return previousSeason(date);
}

export function previousSeason(date: Date) {
	let latestPreviousSeason: (typeof SEASONS)[number] | null = null;
	for (const season of SEASONS) {
		if (date > season.ends) latestPreviousSeason = season;
	}

	return latestPreviousSeason;
}

export function currentSeason(date: Date) {
	for (const season of SEASONS) {
		if (date >= season.starts && date <= season.ends) return season;
	}

	return null;
}

export function nextSeason(date: Date) {
	for (const season of SEASONS) {
		if (date < season.starts) return season;
	}

	return null;
}

export function seasonObject(nth: number) {
	return SEASONS[nth];
}

export function allSeasons(date: Date) {
	const startedSeasons = SEASONS.filter((s) => date >= s.starts);
	if (startedSeasons.length > 0) {
		return startedSeasons.map((s) => s.nth).reverse();
	}

	return [0];
}
