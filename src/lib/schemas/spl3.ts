import * as v from "valibot";

export const SPL3_MODES = ["TW", "SZ", "TC", "RM", "CB"] as const;
export const Spl3ModeSchema = v.picklist(SPL3_MODES);
export type Spl3Mode = v.InferOutput<typeof Spl3ModeSchema>;

export const SPL3_RANKED_MODES = ["SZ", "TC", "RM", "CB"] as const;
export const Spl3RankedModeSchema = v.picklist(SPL3_RANKED_MODES);
export type Spl3RankedMode = v.InferOutput<typeof Spl3RankedModeSchema>;

export const Spl3XRankRegionSchema = v.picklist(["JPN", "WEST"]);
export type Spl3XRankRegion = v.InferOutput<typeof Spl3XRankRegionSchema>;
