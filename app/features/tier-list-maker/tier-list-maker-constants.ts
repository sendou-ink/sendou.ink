import type { TierListMakerTier } from "./tier-list-maker-schemas";

export const DEFAULT_TIER_LABEL_WIDTH = 68;
export const TIER_NAME_MAX_LENGTH = 50;

export const TIER_NAME_FONT_SIZE_BREAKPOINTS = [
	{ maxLength: 3, fontSize: "var(--font-xl)" },
	{ maxLength: 8, fontSize: "var(--font-lg)" },
	{ maxLength: 15, fontSize: "var(--font-md)" },
	{ maxLength: 25, fontSize: "var(--font-sm)" },
	{ maxLength: 35, fontSize: "var(--font-xs)" },
] as const;

export const TIER_NAME_FONT_SIZE_MIN = "var(--font-2xs)";

export const PRESET_COLORS = [
	"#ff4655",
	"#ff8c42",
	"#ffd23f",
	"#bfe84d",
	"#5dbb63",
	"#8b0000",
	"#90ee90",
	"#4169e1",
	"#9b59b6",
	"#20b2aa",
];

export const DEFAULT_TIERS: TierListMakerTier[] = [
	{ id: "tier-x", name: "X", color: "#ff4655" },
	{ id: "tier-s", name: "S", color: "#ff8c42" },
	{ id: "tier-a", name: "A", color: "#ffd23f" },
	{ id: "tier-b", name: "B", color: "#bfe84d" },
	{ id: "tier-c", name: "C", color: "#5dbb63" },
];
