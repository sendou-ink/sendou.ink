import type { CalendarEventTag } from "~/db/tables";

export const tags = {
	SPECIAL: {
		color: "#CE93D8",
	},
	ART: {
		color: "#C158F6",
	},
	MONEY: {
		color: "#96F29D",
	},
	REGION: {
		color: "#FF8C8C",
	},
	LOW: {
		color: "#BBDEFB",
	},
	HIGH: {
		color: "#FFA000",
	},
	COUNT: {
		color: "#62E8F5",
	},
	LAN: {
		color: "#FFF",
	},
	QUALIFIER: {
		color: "#FFC0CB",
	},
	SZ: {
		color: "#F44336",
	},
	TW: {
		color: "#D50000",
	},
	ONES: {
		color: "#FAEC25",
	},
	DUOS: {
		color: "#1ADB1E",
	},
	TRIOS: {
		color: "#B694FF",
	},
	S1: {
		color: "#E5E4E2",
	},
	S2: {
		color: "#388E3C",
	},
	SR: {
		color: "#FBCEB1",
	},
	CARDS: {
		color: "#E4D00A",
	},
	COLLEGIATE: {
		color: "#FFC107",
	},
};

export const CALENDAR_EVENT = {
	NAME_MIN_LENGTH: 2,
	NAME_MAX_LENGTH: 100,
	DESCRIPTION_MAX_LENGTH: 3000,
	RULES_MAX_LENGTH: 10_000,
	DISCORD_INVITE_CODE_MAX_LENGTH: 50,
	BRACKET_URL_MAX_LENGTH: 200,
	MAX_AMOUNT_OF_DATES: 5,
	/** Calendar event tag that is persisted in the database */
	TAGS: Object.keys(tags) as Array<CalendarEventTag>,
	AVATAR_SIZE: 512,
};

export const REG_CLOSES_AT_OPTIONS = [
	"0",
	"5min",
	"10min",
	"15min",
	"30min",
	"1h",
	"1h30min",
	"2h",
	"3h",
	"6h",
	"12h",
	"18h",
	"24h",
	"48h",
	"72h",
] as const;

export type RegClosesAtOption = (typeof REG_CLOSES_AT_OPTIONS)[number];

/** How many days are shown at the /calendar page at a time */
export const DAYS_SHOWN_AT_A_TIME = 4;

/** Tags not shown on the tournament cards */
export const EXCLUDED_TAGS: Array<CalendarEventTag> = [
	"CARDS",
	"SR",
	"SZ",
	"TW",
];
