import { z } from "zod/v4";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { USER } from "../../user-page-constants";

const BIO_WIDGET_SETTINGS_SCHEMA = z.object({
	bio: z.string().min(1).max(USER.BIO_MAX_LENGTH),
});

const BIO_MD_WIDGET_SETTINGS_SCHEMA = z.object({
	bio: z.string().min(1).max(USER.BIO_MD_MAX_LENGTH),
});

const X_RANK_PEAKS_WIDGET_SETTINGS_SCHEMA = z.object({
	division: z.enum(["both", "tentatek", "takoroka"]),
});

const TIMEZONE_WIDGET_SETTINGS_SCHEMA = z.object({
	timezone: z.string().refine((val) => TIMEZONES.includes(val)),
});

const FAVORITE_STAGE_WIDGET_SETTINGS_SCHEMA = z.object({
	stageId: z.number().refine((val) => stageIds.includes(val as any)),
});

export const ALL_WIDGETS = [
	{
		id: "bio",
		category: "misc",
		slot: "main",
		schema: BIO_WIDGET_SETTINGS_SCHEMA,
	},
	{
		id: "bio-md",
		category: "misc",
		slot: "main",
		schema: BIO_MD_WIDGET_SETTINGS_SCHEMA,
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
		id: "timezone",
		category: "misc",
		slot: "side",
		schema: TIMEZONE_WIDGET_SETTINGS_SCHEMA,
	},
	{
		id: "favorite-stage",
		category: "misc",
		slot: "side",
		schema: FAVORITE_STAGE_WIDGET_SETTINGS_SCHEMA,
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
		id: "x-rank-peaks",
		category: "xrank",
		slot: "main",
		schema: X_RANK_PEAKS_WIDGET_SETTINGS_SCHEMA,
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
