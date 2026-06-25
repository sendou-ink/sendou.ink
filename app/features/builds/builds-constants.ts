import { differenceInCalendarDays } from "date-fns";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";

export const MAX_BUILD_FILTERS = 6;

export const FILTER_SEARCH_PARAM_KEY = "f";

type Patch = { patch: string; date: string };

/**
 * Every Splatoon 3 game version that introduced weapon parameter changes, newest first,
 * with its release date (`YYYY-MM-DD`). The version strings match those tracked in the
 * weapon params data (`metadata.versions`), so this is the single source of patch dates
 * used by both the builds date filter and the weapon params patch history.
 */
export const PATCHES: Array<Patch> = [
	{ patch: "11.2.0", date: "2026-06-10" },
	{ patch: "11.1.0", date: "2026-03-18" },
	{ patch: "11.0.1", date: "2026-02-10" },
	{ patch: "11.0.0", date: "2026-01-28" },
	{ patch: "10.1.0", date: "2025-09-03" },
	{ patch: "10.0.0", date: "2025-06-11" },
	{ patch: "9.3.0", date: "2025-03-12" },
	{ patch: "9.2.0", date: "2024-11-20" },
	{ patch: "9.1.0", date: "2024-09-11" },
	{ patch: "9.0.0", date: "2024-08-29" },
	{ patch: "8.1.0", date: "2024-07-17" },
	{ patch: "8.0.0", date: "2024-05-30" },
	{ patch: "7.2.0", date: "2024-04-17" },
	{ patch: "7.1.0", date: "2024-03-21" },
	{ patch: "7.0.0", date: "2024-02-21" },
	{ patch: "6.1.0", date: "2024-01-24" },
	{ patch: "6.0.0", date: "2023-11-29" },
	{ patch: "5.2.0", date: "2023-10-17" },
	{ patch: "5.1.0", date: "2023-09-13" },
	{ patch: "5.0.0", date: "2023-08-30" },
	{ patch: "4.1.0", date: "2023-07-26" },
	{ patch: "4.0.0", date: "2023-05-31" },
	{ patch: "3.1.0", date: "2023-03-07" },
	{ patch: "3.0.0", date: "2023-02-28" },
	{ patch: "2.1.0", date: "2022-12-06" },
	{ patch: "2.0.0", date: "2022-11-30" },
	{ patch: "1.2.0", date: "2022-11-16" },
	{ patch: "1.1.1", date: "2022-09-20" },
	{ patch: "1.1.0", date: "2022-09-08" },
	{ patch: "1.0.0", date: "2022-09-09" },
	{ patch: "0.9.9", date: "2022-09-09" },
];

const RECENT_PATCH_MAX_AGE_IN_DAYS = 365;

/**
 * The subset of {@link PATCHES} released within roughly a year of the newest patch. Used
 * for the builds date filter so its dropdown stays short while always covering the patches
 * builds are most likely to be filtered against.
 */
export const RECENT_PATCHES: Array<Patch> = PATCHES.filter(
	({ date }) =>
		differenceInCalendarDays(new Date(PATCHES[0].date), new Date(date)) <=
		RECENT_PATCH_MAX_AGE_IN_DAYS,
);

export const BUILD = {
	MAX_COUNT: 250,
} as const;

export const BUILDS_PAGE_BATCH_SIZE = 24;
export const BUILDS_PAGE_MAX_BUILDS = 240;

export const EMPTY_BUILD: BuildAbilitiesTupleWithUnknown = [
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
];
