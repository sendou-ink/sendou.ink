import { addHours } from "date-fns";
import { Config } from "~/config";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

/** How long past a season's end its matches can still resolve: 24h stale match routine after a buzzer-beater creation, plus up to an hour of scheduling lag. */
const REPORTING_GRACE_HOURS = 25;

/** Seasons (`nth` from 0) with their start and end dates. Outside production the list is a test set that keeps a season always open. */
export const list =
	// when we do pnpm run setup NODE_ENV is not set -> use test seasons
	!process.env.NODE_ENV ||
	IS_E2E_TEST_RUN ||
	(process.env.NODE_ENV === "development" && !Config.prodMode)
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
				{
					nth: 8,
					starts: new Date("2025-06-16T18:00:00.000Z"),
					ends: new Date("2025-08-24T22:00:00.000Z"),
				},
				{
					nth: 9,
					starts: new Date("2025-09-08T17:00:00.000Z"),
					ends: new Date("2025-11-23T22:00:00.000Z"),
				},
				{
					nth: 10,
					starts: new Date("2025-12-08T17:00:00.000Z"),
					ends: new Date("2026-02-22T22:00:00.000Z"),
				},
				{
					nth: 11,
					starts: new Date("2026-03-09T17:00:00.000Z"),
					ends: new Date("2026-05-17T22:00:00.000Z"),
				},
				{
					nth: 12,
					starts: new Date("2026-06-01T17:00:00.000Z"),
					ends: new Date("2026-08-23T22:00:00.000Z"),
				},
				{
					nth: 13,
					starts: new Date("2026-09-01T17:00:00.000Z"),
					ends: new Date("2026-11-22T22:00:00.000Z"),
				},
			] as const);

/** An item of `Seasons.list`. */
export type ListItem = (typeof list)[number];

/** The current season at `date` (default now), falling back to the previous one. */
export function currentOrPrevious(date?: Date): ListItem | null {
	const _currentSeason = current(date);
	if (_currentSeason) return _currentSeason;

	return previous(date);
}

/** The previous season relative to `date` (default now). */
export function previous(date = new Date()): ListItem | null {
	let latestPreviousSeason: ListItem | null = null;
	for (const season of list) {
		if (date > season.ends) latestPreviousSeason = season;
	}

	return latestPreviousSeason;
}

let seasonEndedOverride = false;

/** Tests only: makes `current()` for "now" resolve to `null` as if every season had ended; an explicit date still resolves normally. */
export function DANGEROUS_setSeasonEndedOverride(seasonEnded: boolean) {
	seasonEndedOverride = seasonEnded;
}

/** The ongoing season at `date` (default now), if any. */
export function current(date?: Date): ListItem | null {
	if (seasonEndedOverride && !date) return null;

	const resolvedDate = date ?? new Date();

	for (const season of list) {
		if (resolvedDate >= season.starts && resolvedDate <= season.ends) {
			return season;
		}
	}

	return null;
}

/** The next upcoming season relative to `date` (default now), if any. */
export function next(date = new Date()): ListItem | null {
	for (const season of list) {
		if (date < season.starts) return season;
	}

	return null;
}

/** Start and end dates of season `nth`. @throws if the season does not exist. */
export function nthToDateRange(nth: number) {
	const seasonObject = list[nth];
	if (!seasonObject) {
		throw new Error(`Season ${nth} not found`);
	}

	return {
		starts: seasonObject.starts,
		ends: seasonObject.ends,
	};
}

/** The range a season's results can land in: the season plus the reporting grace period. @throws if the season does not exist. */
export function nthToReportingDateRange(nth: number) {
	const { starts, ends } = nthToDateRange(nth);

	return {
		starts,
		ends: addHours(ends, REPORTING_GRACE_HOURS),
	};
}

/** Numbers of seasons started by `date` (default now), newest first; `[0]` if none have. */
export function allStarted(date = new Date()) {
	const startedSeasons = list.filter((s) => date >= s.starts);
	if (startedSeasons.length > 0) {
		return startedSeasons.map((s) => s.nth).reverse();
	}

	return [0];
}
/** Numbers of seasons finished by `date` (default now), newest first. */
export function allFinished(date = new Date()) {
	const finishedSeasons = list.filter((s) => date > s.ends);
	return finishedSeasons.map((s) => s.nth).reverse();
}
