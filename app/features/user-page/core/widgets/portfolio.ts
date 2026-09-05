import type * as v from "valibot";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { USER } from "~/features/user-page/user-page-constants";
import type { FormObjectSchema } from "~/form/types";
import type { StoredWidget } from "./types";
import {
	artSchema,
	badgesOwnedSchema,
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
			supporterOnly: true,
			schema: bioMdSchema,
			defaultSettings: { bio: "" },
		}),
		defineWidget({ id: "organizations", slot: "side" }),
		defineWidget({ id: "patron-since", slot: "side", supporterOnly: true }),
		defineWidget({ id: "join-date", slot: "side" }),
		defineWidget({
			id: "timezone",
			slot: "side",
			schema: timezoneSchema,
			defaultSettings: { timezone: TIMEZONES[0] },
		}),
		defineWidget({
			id: "favorite-stage",
			slot: "side",
			supporterOnly: true,
			schema: favoriteStageSchema,
			defaultSettings: { stageId: 1 },
		}),
		defineWidget({ id: "weapon-pool", slot: "main" }),
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
			supporterOnly: true,
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
	trophies: [defineWidget({ id: "trophies-owned", slot: "main" })],
	badges: [
		defineWidget({
			id: "badges-owned",
			slot: "main",
			schema: badgesOwnedSchema,
			defaultSettings: { favoriteBadgeIds: [] },
		}),
		defineWidget({ id: "badges-authored", slot: "main" }),
		defineWidget({ id: "badges-managed", slot: "main" }),
	],
	teams: [defineWidget({ id: "teams", slot: "side" })],
	friends: [defineWidget({ id: "friends", slot: "side" })],
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
			supporterOnly: true,
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
			supporterOnly: true,
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

/**
 * Layout of a user who has not saved their own, matching what the profile page
 * showed before it was widget based.
 */
export const DEFAULT_WIDGETS: StoredWidget[] = [
	{ id: "weapon-pool" },
	{ id: "x-rank-peaks", settings: { division: "both" } },
	{ id: "badges-owned", settings: { favoriteBadgeIds: [] } },
	{ id: "bio", settings: { bio: "" } },
	{ id: "teams" },
	{
		id: "sens",
		settings: { controller: "s2-pro-con", motionSens: null, stickSens: null },
	},
	{ id: "join-date" },
];

export function allWidgetsFlat() {
	return Object.values(ALL_WIDGETS).flat();
}

export function findWidgetById(widgetId: string) {
	return allWidgetsFlat().find((w) => w.id === widgetId);
}

/** How many widgets fit in each slot, supporters get more. */
export function maxWidgetsPerSlot(isSupporter: boolean) {
	return isSupporter
		? {
				main: USER.MAX_MAIN_WIDGETS_SUPPORTER,
				side: USER.MAX_SIDE_WIDGETS_SUPPORTER,
			}
		: { main: USER.MAX_MAIN_WIDGETS, side: USER.MAX_SIDE_WIDGETS };
}

/** Drops supporter only widgets and widgets past the slot limits e.g. when supporter status lapsed. */
export function widgetsAvailableTo(
	widgets: StoredWidget[],
	isSupporter: boolean,
): StoredWidget[] {
	const max = maxWidgetsPerSlot(isSupporter);
	const result: StoredWidget[] = [];
	let mainCount = 0;
	let sideCount = 0;

	for (const widget of widgets) {
		const definition = findWidgetById(widget.id);

		if (!isSupporter && definition?.supporterOnly) continue;

		const slot = definition?.slot;

		if (slot === "main") {
			mainCount++;
			if (mainCount > max.main) continue;
		} else if (slot === "side") {
			sideCount++;
			if (sideCount > max.side) continue;
		}

		result.push(widget);
	}

	return result;
}

function defineWidget<
	const Id extends string,
	const Slot extends "main" | "side",
	S extends FormObjectSchema,
>(def: {
	id: Id;
	slot: Slot;
	supporterOnly?: true;
	schema: S;
	defaultSettings: v.InferOutput<S>;
}): typeof def;

function defineWidget<
	const Id extends string,
	const Slot extends "main" | "side",
>(def: {
	id: Id;
	slot: Slot;
	supporterOnly?: true;
	schema?: never;
}): typeof def;
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
