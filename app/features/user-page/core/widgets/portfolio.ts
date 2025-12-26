import { z } from "zod/v4";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { dbBoolean, weaponSplId } from "~/utils/zod";
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

const WEAPON_POOL_WIDGET_SETTINGS_SCHEMA = z.object({
	weapons: z
		.array(
			z.object({
				weaponSplId,
				isFavorite: dbBoolean,
			}),
		)
		.max(USER.WEAPON_POOL_MAX_SIZE),
});

const PEAK_XP_WEAPON_WIDGET_SETTINGS_SCHEMA = z.object({
	weaponSplId,
});

export const ALL_WIDGETS = {
	misc: [
		{
			id: "bio",
			slot: "main",
			schema: BIO_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "bio-md",
			slot: "main",
			schema: BIO_MD_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "organizations",
			slot: "side",
		},
		{
			id: "patron-since",
			slot: "side",
		},
		{
			id: "timezone",
			slot: "side",
			schema: TIMEZONE_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "favorite-stage",
			slot: "side",
			schema: FAVORITE_STAGE_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "weapon-pool",
			slot: "main",
			schema: WEAPON_POOL_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "lfg-posts",
			slot: "main",
		},
	],
	badges: [
		{
			id: "badges-owned",
			slot: "main",
		},
		{
			id: "badges-authored",
			slot: "main",
		},
	],
	teams: [
		{
			id: "teams",
			slot: "side",
		},
	],
	sendouq: [
		{
			id: "peak-sp",
			slot: "side",
		},
	],
	xrank: [
		{
			id: "peak-xp",
			slot: "side",
		},
		{
			id: "peak-xp-weapon",
			slot: "side",
			schema: PEAK_XP_WEAPON_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "x-rank-peaks",
			slot: "main",
			schema: X_RANK_PEAKS_WIDGET_SETTINGS_SCHEMA,
		},
		{
			id: "top-500-weapons",
			slot: "side",
		},
		{
			id: "top-500-weapons-shooters",
			slot: "side",
		},
		{
			id: "top-500-weapons-blasters",
			slot: "side",
		},
		{
			id: "top-500-weapons-rollers",
			slot: "side",
		},
		{
			id: "top-500-weapons-brushes",
			slot: "side",
		},
		{
			id: "top-500-weapons-chargers",
			slot: "side",
		},
		{
			id: "top-500-weapons-sloshers",
			slot: "side",
		},
		{
			id: "top-500-weapons-splatlings",
			slot: "side",
		},
		{
			id: "top-500-weapons-dualies",
			slot: "side",
		},
		{
			id: "top-500-weapons-brellas",
			slot: "side",
		},
		{
			id: "top-500-weapons-stringers",
			slot: "side",
		},
		{
			id: "top-500-weapons-splatanas",
			slot: "side",
		},
	],
	tournaments: [
		{
			id: "highlighted-results",
			slot: "side",
		},
		{
			id: "placement-results",
			slot: "side",
		},
	],
	vods: [
		{
			id: "videos",
			slot: "main",
		},
	],
	builds: [
		{
			id: "builds",
			slot: "main",
		},
	],
} as const;

export function allWidgetsFlat() {
	return Object.values(ALL_WIDGETS).flat();
}

export function findWidgetById(widgetId: string) {
	return allWidgetsFlat().find((w) => w.id === widgetId);
}
