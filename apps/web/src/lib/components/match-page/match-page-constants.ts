export const TAB_KEYS = {
	ROSTERS: "rosters",
	ACTION: "action",
	RESULT: "result",
	STATS: "stats",
	ADMIN: "admin",
} as const;

export const MATCH_PAGE_TABS = [
	"rosters",
	"action",
	"result",
	"stats",
	"admin",
] as const;

export type MatchTabsKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];
