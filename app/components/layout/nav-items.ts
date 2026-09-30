import { Config } from "~/config";

export const navItems = [
	{
		name: "settings",
		url: "settings",
	},
	Config.showLutiNavItem
		? {
				name: "luti",
				url: "luti",
			}
		: null,
	{
		name: "sendouq",
		url: "q",
	},
	{
		name: "analyzer",
		url: "analyzer",
	},
	{
		name: "comp-analyzer",
		url: "comp-analyzer",
	},
	{
		name: "builds",
		url: "builds",
	},
	{
		name: "object-damage-calculator",
		url: "object-damage-calculator",
	},
	{
		name: "leaderboards",
		url: "leaderboards",
	},
	{
		name: "scrims",
		url: "scrims",
	},
	{
		name: "lfg",
		url: "lfg",
	},
	{
		name: "plans",
		url: "plans",
	},
	{
		name: "trophies",
		url: "trophies",
	},
	{
		name: "calendar",
		url: "calendar",
	},
	{
		name: "plus",
		url: "plus/suggestions",
	},
	{
		name: "xsearch",
		url: "xsearch",
	},
	{
		name: "articles",
		url: "a",
	},
	{
		name: "vods",
		url: "vods",
	},
	{
		name: "art",
		url: "art",
	},
	{
		name: "tier-list-maker",
		url: "tier-list-maker",
	},
	{
		name: "links",
		url: "links",
	},
	{
		name: "maps",
		url: "maps",
	},
].filter((item) => item !== null);
