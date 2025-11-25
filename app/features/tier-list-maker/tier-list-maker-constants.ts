import type { TierListMakerTier } from "./tier-list-maker-schemas";

export const DEFAULT_TIER_LABEL_WIDTH = 68;
export const TIER_NAME_MAX_LENGTH = 50;

export const TIER_NAME_FONT_SIZE_BREAKPOINTS = [
	{ maxLength: 3, fontSize: "var(--fonts-xl)" },
	{ maxLength: 8, fontSize: "var(--fonts-lg)" },
	{ maxLength: 15, fontSize: "var(--fonts-md)" },
	{ maxLength: 25, fontSize: "var(--fonts-sm)" },
	{ maxLength: 35, fontSize: "var(--fonts-xs)" },
] as const;

export const TIER_NAME_FONT_SIZE_MIN = "var(--fonts-xxs)";

export const DEFAULT_TIERS: TierListMakerTier[] = [
	{ id: "tier-x", name: "X", color: "#ff4655" },
	{ id: "tier-s", name: "S", color: "#ff8c42" },
	{ id: "tier-a", name: "A", color: "#ffd23f" },
	{ id: "tier-b", name: "B", color: "#bfe84d" },
	{ id: "tier-c", name: "C", color: "#5dbb63" },
];
