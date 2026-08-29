import type { OgImagePage } from "~/utils/urls";

export const CHANGELOG_FOLDER_PATH = "changelog";

/**
 * Discord emoji shortcode per nav item, either one uploaded to the server or a
 * built-in. Typing `:name:` in the Discord client resolves to the emoji, so the
 * generated post is copy-pasteable. Most match the nav item name but not all.
 */
export const DISCORD_EMOJI_NAMES: Record<OgImagePage, string> = {
	settings: "settings",
	sendouq: "sendouq",
	analyzer: "analyzer",
	"comp-analyzer": "comp_analyzer",
	builds: "builds",
	"object-damage-calculator": "object_damage_calculator",
	leaderboards: "leaderboards",
	scrims: "scrims",
	lfg: "lfg",
	plans: "plans",
	trophies: "trophies",
	// built-in 📆
	calendar: "calendar~1",
	plus: "plus",
	xsearch: "xsearch",
	articles: "articles",
	vods: "vods",
	art: "art",
	"tier-list-maker": "tier_list_maker",
	links: "links",
	maps: "maps",
};

/** Stands in for the sendou.ink logo, used by entries without a nav item. */
export const DISCORD_FALLBACK_EMOJI_NAME = "sendou";
