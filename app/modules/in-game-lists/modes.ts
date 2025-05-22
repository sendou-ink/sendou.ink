import type { RankedModeShort } from "./types";

// xxx: retire this
export const modes = [
	{ short: "TW" },
	{ short: "SZ" },
	{ short: "TC" },
	{ short: "RM" },
	{ short: "CB" },
] as const;

export const modesShort = modes.map((mode) => mode.short);
export const rankedModesShort = modesShort.slice(1) as RankedModeShort[];

export const modesShortWithSpecial = [...modesShort, "TB", "SR"] as const;
