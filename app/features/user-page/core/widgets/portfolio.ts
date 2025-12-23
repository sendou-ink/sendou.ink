export const ALL_WIDGETS = [
	{
		id: "bio",
		category: "misc",
		slot: "main",
	},
	{
		id: "badges-owned",
		category: "badges",
		slot: "main",
	},
	{
		id: "badges-authored",
		category: "badges",
		slot: "main",
	},
	{
		id: "teams",
		category: "teams",
		slot: "side",
	},
	{
		id: "organizations",
		category: "misc",
		slot: "side",
	},
	{
		id: "peak-sp",
		category: "sendouq",
		slot: "side",
	},
	{
		id: "peak-xp",
		category: "xrank",
		slot: "side",
	},
	{
		id: "highlighted-results",
		category: "tournaments",
		slot: "side",
	},
	{
		id: "patron-since",
		category: "misc",
		slot: "side",
	},
	{
		id: "videos",
		category: "vods",
		slot: "main",
	},
	{
		id: "lfg-posts",
		category: "misc",
		slot: "main",
	},
	{
		id: "top-500-weapons",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-shooters",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-blasters",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-rollers",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-brushes",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-chargers",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-sloshers",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-splatlings",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-dualies",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-brellas",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-stringers",
		category: "xrank",
		slot: "side",
	},
	{
		id: "top-500-weapons-splatanas",
		category: "xrank",
		slot: "side",
	},
] as const;

export const ALL_WIDGET_IDS = ALL_WIDGETS.map((w) => w.id);
