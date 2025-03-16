export const navItems = [
	{
		name: "settings",
		url: "settings",
		prefetch: true,
	},
	import.meta.env.VITE_SHOW_LUTI_NAV_ITEM === "true"
		? {
				name: "luti",
				url: "luti",
				prefetch: false,
			}
		: null,
	{
		name: "sendouq",
		url: "q",
		prefetch: false,
	},
	{
		name: "analyzer",
		url: "analyzer",
		prefetch: true,
	},
	{
		name: "builds",
		url: "builds",
		prefetch: true,
	},
	{
		name: "object-damage-calculator",
		url: "object-damage-calculator",
		prefetch: true,
	},
	{
		name: "leaderboards",
		url: "leaderboards",
		prefetch: false,
	},
	{
		name: "lfg",
		url: "lfg",
		prefetch: false,
	},
	{
		name: "plans",
		url: "plans",
		prefetch: false,
	},
	{
		name: "badges",
		url: "badges",
		prefetch: false,
	},
	{
		name: "calendar",
		url: "calendar",
		prefetch: false,
	},
	{
		name: "plus",
		url: "plus/suggestions",
		prefetch: false,
	},
	{
		name: "u",
		url: "u",
		prefetch: false,
	},
	{
		name: "xsearch",
		url: "xsearch",
		prefetch: false,
	},
	{
		name: "articles",
		url: "a",
		prefetch: false,
	},
	{
		name: "vods",
		url: "vods",
		prefetch: false,
	},
	{
		name: "art",
		url: "art",
		prefetch: false,
	},
	{
		name: "t",
		url: "t",
		prefetch: false,
	},
	{
		name: "links",
		url: "links",
		prefetch: true,
	},
	{
		name: "maps",
		url: "maps",
		prefetch: false,
	},
].filter((item) => item !== null);
