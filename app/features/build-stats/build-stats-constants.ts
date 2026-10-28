import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { RECENT_PATCHES } from "~/features/builds/builds-constants";

export const POPULAR_BUILDS_MAX_COUNT = 25;

export const STAPLES_COUNT = 7;

/** Build variety tells how many players run one of this many most popular builds. */
export const VARIETY_TOP_BUILDS_COUNT = 10;

export const PEERS_COUNT = 5;

/** Weapons with fewer builds are left out of the comparison as their averages are mostly noise. */
export const PEER_MIN_BUILDS_COUNT = 10;

export const AP_DISTRIBUTION_BINS = [
	{ min: 0, max: 0 },
	{ min: 3, max: 3 },
	{ min: 6, max: 9 },
	{ min: 10, max: 19 },
	{ min: 20, max: 29 },
	{ min: 30, max: MAX_AP },
] as const;

/** Date filter value including builds updated whenever. */
export const ANY_TIME = "ANY";

/** Date filter value used when none is selected, the oldest patch the filter offers so the stats cover about a year. Falls back to `ANY_TIME` if the weapon has no builds since it. */
export const DEFAULT_UPDATED_SINCE = RECENT_PATCHES.at(-1)!.date;
