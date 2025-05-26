import type { RankedModeShort } from "./types";

export const modesShort = ["TW", "SZ", "TC", "RM", "CB"] as const;
export const rankedModesShort = modesShort.slice(1) as RankedModeShort[];

export const modesShortWithSpecial = [...modesShort, "TB", "SR"] as const;
