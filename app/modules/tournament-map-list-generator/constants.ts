import { MapPool } from "~/features/map-list-generator/core/map-pool";

export const sourceTypes = [
	"DEFAULT",
	"TIEBREAKER",
	"BOTH",
	"TO",
	"COUNTERPICK",
] as const;

// this is only used as a fallback, in the case that map list generation has a bug
export const DEFAULT_MAP_POOL = new MapPool([
	{ mode: "SZ", stageId: 6 },
	{ mode: "SZ", stageId: 8 },
	{ mode: "SZ", stageId: 9 },
	{ mode: "SZ", stageId: 15 },
	{ mode: "SZ", stageId: 17 },

	{ mode: "TC", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "TC", stageId: 10 },
	{ mode: "TC", stageId: 14 },
	{ mode: "TC", stageId: 16 },

	{ mode: "RM", stageId: 0 },
	{ mode: "RM", stageId: 3 },
	{ mode: "RM", stageId: 9 },
	{ mode: "RM", stageId: 10 },
	{ mode: "RM", stageId: 17 },

	{ mode: "CB", stageId: 0 },
	{ mode: "CB", stageId: 1 },
	{ mode: "CB", stageId: 8 },
	{ mode: "CB", stageId: 14 },
	{ mode: "CB", stageId: 16 },
]);
