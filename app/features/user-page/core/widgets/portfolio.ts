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
] as const;

export const ALL_WIDGET_IDS = ALL_WIDGETS.map((w) => w.id);
