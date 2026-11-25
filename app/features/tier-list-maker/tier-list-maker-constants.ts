import type { TierListMakerTier } from "./tier-list-maker-schemas";

export const TIER_NAME_MAX_LENGTH = 50;

export const PRESET_COLORS = [
	"#ff5c66",
	"#ff8c42",
	"#ffd23f",
	"#bfe84d",
	"#5dbb63",
	"#e56fb0",
	"#8b0000",
	"#90ee90",
	"#4169e1",
	"#9b59b6",
	"#20b2aa",
];

export const DEFAULT_TIERS: TierListMakerTier[] = [
	{ id: "tier-x", name: "X", color: "#ff5c66" },
	{ id: "tier-s", name: "S", color: "#ff8c42" },
	{ id: "tier-a", name: "A", color: "#ffd23f" },
	{ id: "tier-b", name: "B", color: "#bfe84d" },
	{ id: "tier-c", name: "C", color: "#5dbb63" },
];
