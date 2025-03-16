import type { RankedModeShort } from "./types";

export const modes = [
	{ short: "TW" },
	{ short: "SZ" },
	{ short: "TC" },
	{ short: "RM" },
	{ short: "CB" },
] as const;

export const modesShort = modes.map((mode) => mode.short);
export const rankedModesShort = modesShort.slice(1) as RankedModeShort[];
