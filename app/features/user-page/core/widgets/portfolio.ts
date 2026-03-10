import type { z } from "zod";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import type { StoredWidget } from "./types";
import {
	artSchema,
	bioMdSchema,
	bioSchema,
	favoriteStageSchema,
	gameBadgesSchema,
	gameBadgesSmallSchema,
	linksSchema,
	peakXpUnverifiedSchema,
	peakXpWeaponSchema,
	sensSchema,
	tierListSchema,
	timezoneSchema,
	weaponPoolSchema,
	xRankPeaksSchema,
} from "./widget-form-schemas";

export const ALL_WIDGETS = {
	misc: [
		defineWidget({
			id: "bio",
			slot: "main",
			schema: bioSchema,
			defaultSettings: { bio: "" },
		}),
		defineWidget({
			id: "bio-md",
			slot: "main",
			schema: bioMdSchema,
			defaultSettings: { bio: "" },
		}),
		defineWidget({ id: "organizations", slot: "side" }),
		defineWidget({ id: "patron-since", slot: "side" }),
		defineWidget({
			id: "timezone",
			slot: "side",
			schema: timezoneSchema,
			defaultSettings: { timezone: TIMEZONES[0] },
		}),
		defineWidget({
			id: "favorite-stage",
			slot: "side",
			schema: favoriteStageSchema,
			defaultSettings: { stageId: 1 },
		}),
		defineWidget({
			id: "weapon-pool",
			slot: "main",
			schema: weaponPoolSchema,
			defaultSettings: { weapons: [] },
		}),
		defineWidget({ id: "lfg-posts", slot: "main" }),
		defineWidget({
			id: "sens",
			slot: "side",
			schema: sensSchema,
			defaultSettings: {
				controller: "s1-pro-con",
				motionSens: 0,
				stickSens: 0,
			},
		}),
		defineWidget({ id: "commissions", slot: "side" }),
		defineWidget({ id: "social-links", slot: "side" }),
		defineWidget({
			id: "links",
			slot: "side",
			schema: linksSchema,
			defaultSettings: { links: [] },
		}),
		defineWidget({
			id: "tier-list",
			slot: "side",
			schema: tierListSchema,
			defaultSettings: { searchParams: "" },
		}),
	],
	badges: [
		defineWidget({ id: "badges-owned", slot: "main" }),
		defineWidget({ id: "badges-authored", slot: "main" }),
		defineWidget({ id: "badges-managed", slot: "main" }),
	],
	teams: [defineWidget({ id: "teams", slot: "side" })],
	sendouq: [
		defineWidget({ id: "peak-sp", slot: "side" }),
		defineWidget({ id: "top-10-seasons", slot: "side" }),
		defineWidget({ id: "top-100-seasons", slot: "side" }),
	],
	xrank: [
		defineWidget({ id: "peak-xp", slot: "side" }),
		defineWidget({
			id: "peak-xp-unverified",
			slot: "side",
			schema: peakXpUnverifiedSchema,
			defaultSettings: { peakXp: 2000, division: "tentatek" },
		}),
		defineWidget({
			id: "peak-xp-weapon",
			slot: "side",
			schema: peakXpWeaponSchema,
			defaultSettings: { weaponSplId: 0 },
		}),
		defineWidget({
			id: "x-rank-peaks",
			slot: "main",
			schema: xRankPeaksSchema,
			defaultSettings: { division: "both" },
		}),
		defineWidget({ id: "top-500-weapons", slot: "side" }),
		defineWidget({ id: "top-500-weapons-shooters", slot: "side" }),
		defineWidget({ id: "top-500-weapons-blasters", slot: "side" }),
		defineWidget({ id: "top-500-weapons-rollers", slot: "side" }),
		defineWidget({ id: "top-500-weapons-brushes", slot: "side" }),
		defineWidget({ id: "top-500-weapons-chargers", slot: "side" }),
		defineWidget({ id: "top-500-weapons-sloshers", slot: "side" }),
		defineWidget({ id: "top-500-weapons-splatlings", slot: "side" }),
		defineWidget({ id: "top-500-weapons-dualies", slot: "side" }),
		defineWidget({ id: "top-500-weapons-brellas", slot: "side" }),
		defineWidget({ id: "top-500-weapons-stringers", slot: "side" }),
		defineWidget({ id: "top-500-weapons-splatanas", slot: "side" }),
	],
	tournaments: [
		defineWidget({ id: "highlighted-results", slot: "side" }),
		defineWidget({ id: "placement-results", slot: "side" }),
	],
	vods: [defineWidget({ id: "videos", slot: "main" })],
	builds: [defineWidget({ id: "builds", slot: "main" })],
	art: [
		defineWidget({
			id: "art",
			slot: "main",
			schema: artSchema,
			defaultSettings: { source: "ALL" },
		}),
	],
	"game-badges": [
		defineWidget({
			id: "game-badges",
			slot: "main",
			schema: gameBadgesSchema,
			defaultSettings: { badgeIds: [] },
		}),
		defineWidget({
			id: "game-badges-small",
			slot: "side",
			schema: gameBadgesSmallSchema,
			defaultSettings: { badgeIds: [] },
		}),
	],
} as const;

export function allWidgetsFlat() {
	return Object.values(ALL_WIDGETS).flat();
}

export function findWidgetById(widgetId: string) {
	return allWidgetsFlat().find((w) => w.id === widgetId);
}

function defineWidget<
	const Id extends string,
	const Slot extends "main" | "side",
	S extends z.ZodObject<z.ZodRawShape>,
>(def: {
	id: Id;
	slot: Slot;
	schema: S;
	defaultSettings: z.infer<S>;
}): typeof def;

function defineWidget<
	const Id extends string,
	const Slot extends "main" | "side",
>(def: { id: Id; slot: Slot; schema?: never }): typeof def;
function defineWidget(def: Record<string, unknown>) {
	return def;
}

export function defaultStoredWidget(widgetId: string): StoredWidget {
	const widget = findWidgetById(widgetId);
	if (!widget) throw new Error(`Unknown widget: ${widgetId}`);

	if ("defaultSettings" in widget) {
		return { id: widget.id, settings: widget.defaultSettings } as StoredWidget;
	}

	return { id: widget.id } as StoredWidget;
}
