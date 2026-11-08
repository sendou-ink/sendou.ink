import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DASHBOARD_TABS,
	BROADCAST_DESIGN_BEST_OF,
	BROADCAST_DESIGN_BRACKETS,
	BROADCAST_DESIGN_FOOTAGE,
	BROADCAST_DESIGN_MAX_OTHER_MATCHES,
	BROADCAST_DESIGN_MAX_PLAYERS,
	BROADCAST_DESIGN_NAME_LENGTHS,
	BROADCAST_DESIGN_SET_STAGES,
	BROADCAST_INK_COLORS,
	BROADCAST_MAX_CASTERS,
	BROADCAST_SCENES,
	BROADCAST_STREAM_ROLES,
	BROADCAST_TRANSITIONS,
	BROADCAST_VIEWS,
} from "./broadcast-constants";

export const broadcastOverlaySearchParams = SearchParams.define({
	view: SP.param(v.picklist(BROADCAST_VIEWS), {
		default: "live",
		loader: false,
	}),
	/** Shown in the dashboard instead of OBS, not counted as an OBS source */
	preview: SP.param(v.boolean(), { default: false, loader: false }),
});

export const broadcastStreamSearchParams = SearchParams.define({
	role: SP.param(v.picklist(BROADCAST_STREAM_ROLES), {
		default: "source",
		loader: true,
	}),
});

export const broadcastDashboardSearchParams = SearchParams.define({
	tab: SP.param(v.picklist(BROADCAST_DASHBOARD_TABS), {
		default: "setup",
		loader: false,
	}),
});

const countBetween = (min: number, max: number) =>
	v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

/** The designer's scene and the mock scenario it shows, so a scenario can be linked to. */
export const broadcastDesignSearchParams = SearchParams.define({
	scene: SP.param(v.picklist(BROADCAST_SCENES), {
		default: "game",
		loader: false,
	}),
	/** Game feed screenshot under the overlay. */
	footage: SP.param(
		v.picklist(
			Object.keys(BROADCAST_DESIGN_FOOTAGE) as Array<
				keyof typeof BROADCAST_DESIGN_FOOTAGE
			>,
		),
		{ default: "gameplay", loader: false },
	),
	transition: SP.param(v.picklist(BROADCAST_TRANSITIONS), {
		default: "stinger",
		loader: false,
	}),
	names: SP.param(v.picklist(BROADCAST_DESIGN_NAME_LENGTHS), {
		default: "typical",
		loader: false,
	}),
	set: SP.param(v.picklist(BROADCAST_DESIGN_SET_STAGES), {
		default: "ongoing",
		loader: false,
	}),
	bestOf: SP.param(v.picklist(BROADCAST_DESIGN_BEST_OF), {
		default: 5,
		loader: false,
	}),
	/** In-game ink colors of the game scene, `null` keeps the theme's team colors. */
	ink: SP.param(
		v.nullable(v.picklist(BROADCAST_INK_COLORS.map((color) => color.key))),
		{ loader: false },
	),
	swapSides: SP.param(v.boolean(), { default: false, loader: false }),
	seeds: SP.param(v.boolean(), { default: true, loader: false }),
	/** Team logos, without them teams show their initial. */
	logos: SP.param(v.boolean(), { default: true, loader: false }),
	/** The tournament's logo standing in for the featured teams' real logos too. */
	placeholderLogos: SP.param(v.boolean(), { default: false, loader: false }),
	players: SP.param(countBetween(1, BROADCAST_DESIGN_MAX_PLAYERS), {
		default: 4,
		loader: false,
	}),
	casters: SP.param(countBetween(0, BROADCAST_MAX_CASTERS), {
		default: 2,
		loader: false,
	}),
	/** Other matches in the "elsewhere" ticker. */
	otherMatches: SP.param(countBetween(0, BROADCAST_DESIGN_MAX_OTHER_MATCHES), {
		default: 4,
		loader: false,
	}),
	headline: SP.param(v.boolean(), { default: true, loader: false }),
	bracket: SP.param(v.picklist(BROADCAST_DESIGN_BRACKETS), {
		default: "double_elimination",
		loader: false,
	}),
	bracketFocus: SP.param(v.picklist(BROADCAST_BRACKET_FOCUSES), {
		default: "remaining",
		loader: false,
	}),
});
