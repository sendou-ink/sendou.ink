import { DEFAULT_BROADCAST_SETTINGS } from "~/features/broadcast/broadcast-constants";
import type * as Producer from "~/features/broadcast/core/Producer";
import type {
	CastBroadcastSettings,
	CastProducerState,
	CastScene,
} from "./broadcast-cast-types";
import { needsFeaturedMatch } from "./broadcast-cast-utils";

/** Scenes the cast overlay can show. */
export const BROADCAST_SCENES = [
	"starting",
	"casters",
	"rosters",
	"maps",
	"game",
	"results",
	"break",
	"replays",
	"bracket",
	"team",
	"technical",
	"ending",
] as const;

/**
 * Scenes without footage of their own to last as long as, which can be given a duration instead: the one they get
 * when picked (`null` until a Take) and the ones the dashboard offers. Starting soon counts its duration down on air.
 * The others stay on air until a Take.
 */
export const BROADCAST_SCENE_DURATIONS_MS: Partial<
	Record<CastScene, { defaultMs: number | null; optionsMs: readonly number[] }>
> = {
	starting: {
		defaultMs: null,
		optionsMs: [
			60_000, 120_000, 180_000, 300_000, 600_000, 900_000, 1_200_000, 1_800_000,
		],
	},
	results: {
		defaultMs: null,
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
	bracket: {
		defaultMs: 15_000,
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
	team: {
		defaultMs: 20_000,
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
};

/**
 * Part of the bracket the bracket scene shows: the rounds still being played of both sides (`remaining`), of one
 * side, or every round of both.
 */
export const BROADCAST_BRACKET_FOCUSES = [
	"remaining",
	"winners",
	"losers",
	"whole",
] as const;

/** Tabs of the dashboard's show settings under the switcher: the OBS setup and the theme. */
export const BROADCAST_DASHBOARD_TABS = ["setup", "theme"] as const;

// xxx: prototype, these come from the scanner eventually
/** Replay clips the dashboard sends to the overlays over WebRTC. */
export const BROADCAST_PROTOTYPE_CLIPS = [
	{
		id: "498017-56-11",
		name: "4 splats · Oct 24",
		url: "/broadcast-clips/2026-10-24-498017-56-11-4-splats.mp4",
		durationMs: 25_180,
	},
	{
		id: "498089-57-00",
		name: "4 splats · Oct 27",
		url: "/broadcast-clips/2026-10-27-498089-57-00-4-splats.mp4",
		durationMs: 25_260,
	},
	{
		id: "498090-40-26",
		name: "4 splats · Oct 27 (2)",
		url: "/broadcast-clips/2026-10-27-498090-40-26-4-splats.mp4",
		durationMs: 19_593,
	},
] as const;

/**
 * The overlays' stylesheets the designer lays out for editing, in its order, named after their `.module.css` files in
 * `components/` (this feature's or `broadcast`'s). Their classes are `.{stylesheet}-{class}` in the custom CSS, e.g. `.GameScene-infoCard`.
 * Renaming one, or a class of one, breaks the themes editing it.
 */
export const BROADCAST_THEME_STYLESHEETS = [
	"BroadcastOverlay",
	"Stinger",
	"SceneBackdrop",
	"TeamLogo",
	"Matchup",
	"Ticker",
	"GameScene",
	"RostersScene",
	"MapsScene",
	"ResultsScene",
	"ReplaysScene",
	"CastersScene",
	"BracketScene",
	"TeamScene",
	"HoldScene",
] as const;

/** Screenshots of the game feed the designer can show under the overlay, by the gameplay they show (paths for `broadcastDesignImageUrl`). */
export const BROADCAST_DESIGN_FOOTAGE = {
	gameplay: "footage/gameplay.webp",
	minimap: "footage/minimap.webp",
	none: null,
} as const;

/** How long the designer's mock team and player names are. */
export const BROADCAST_DESIGN_NAME_LENGTHS = [
	"short",
	"typical",
	"long",
] as const;

/** How far the designer's mock set is. */
export const BROADCAST_DESIGN_SET_STAGES = [
	"start",
	"ongoing",
	"decider",
	"over",
] as const;

/** Brackets the designer can mock for the bracket scene. */
export const BROADCAST_DESIGN_BRACKETS = [
	"double_elimination",
	"single_elimination",
	"round_robin",
	"swiss",
] as const;

export const BROADCAST_DESIGN_BEST_OF = [3, 5, 7] as const;

export const BROADCAST_DESIGN_MAX_PLAYERS = 4;

export const BROADCAST_DESIGN_MAX_OTHER_MATCHES = 8;

/** Scenes without gameplay, all drawn by the same full screen design. */
const BROADCAST_HOLD_SCENES = [
	"starting",
	"break",
	"technical",
	"ending",
] as const satisfies ReadonlyArray<(typeof BROADCAST_SCENES)[number]>;

/** The dashboard's scene buttons, grouped and in the order the number keys 1–9 and 0 pick the first ten. Every scene is in one group. */
export const BROADCAST_SCENE_GROUPS = [
	{ key: "match", scenes: ["rosters", "maps", "game", "results", "replays"] },
	{ key: "show", scenes: ["casters", "bracket", "team"] },
	{ key: "hold", scenes: BROADCAST_HOLD_SCENES },
] as const satisfies ReadonlyArray<{
	key: string;
	scenes: ReadonlyArray<(typeof BROADCAST_SCENES)[number]>;
}>;

/**
 * Stable `data-part` hooks of each design for custom CSS, e.g. `[data-scene="game"] [data-part="team-name"]`.
 * `hold` is the design of {@link BROADCAST_HOLD_SCENES}, `matchup` the featured match line some scenes show,
 * `ticker` the other matches' scores along the bottom of the game and hold scenes and `stinger` the transition over every scene. Every scene has a `backdrop` except game and replays, maps' with a `backdrop-video` of the next map under a `backdrop-vignette` darkening its edges.
 * Renaming one breaks users' themes.
 */
export const BROADCAST_SCENE_PARTS = {
	game: [
		"info-bar",
		"tournament-logo",
		"round",
		"set-length",
		"casters",
		"caster",
		"caster-pronouns",
		"map-intro",
		"game-number",
		"mode",
		"stage",
		"scoreboard",
		"team",
		"team-logo",
		"team-seed",
		"team-name",
		"team-score",
		"roster",
		"player",
		"player-name",
	],
	rosters: [
		"header",
		"tournament-logo",
		"tournament-name",
		"round",
		"set-length",
		"versus",
		"team",
		"team-logo",
		"team-name",
		"team-seed",
		"player",
		"player-avatar",
		"player-name",
		"player-weapons",
	],
	maps: [
		"header",
		"round",
		"score",
		"team",
		"team-logo",
		"team-name",
		"game",
		"game-number",
		"up-next",
		"mode",
		"stage",
		"winner",
	],
	results: [
		"map",
		"map-video",
		"round",
		"games",
		"game-number",
		"mode",
		"stage",
		"team",
		"team-header",
		"team-logo",
		"team-name",
		"team-score",
		"result",
		"player",
		"player-weapon",
		"player-name",
		"player-abilities",
		"objective",
		"control",
		"control-share",
		"objective-chart",
		"objective-line",
		"control-lane",
	],
	casters: [
		"header",
		"tournament-name",
		"title",
		"camera",
		"caster-name",
		"caster-pronouns",
	],
	bracket: [
		"header",
		"tournament-logo",
		"tournament-name",
		"bracket-name",
		"group-name",
		"side",
		"round",
		"round-name",
		"match",
		"team",
		"team-logo",
		"team-seed",
		"team-name",
		"team-score",
		"standings",
		"standing",
		"standing-placement",
		"standing-sets",
		"standing-maps",
		"swiss-round",
	],
	team: [
		"header",
		"team-logo",
		"team-name",
		"team-seed",
		"tournament-name",
		"stat",
		"stat-label",
		"stat-value",
		"stat-share",
		"section-title",
		"player",
		"player-avatar",
		"player-name",
		"player-weapons",
		"mode-record",
		"map-pool",
		"map",
		"map-mode",
		"map-name",
		"set",
		"set-score",
		"set-round",
		"set-opponent",
		"set-opponent-seed",
		"set-games",
		"set-game",
	],
	replays: [
		"clip",
		"corner",
		"replay-bug",
		"replay-dot",
		"replay-label",
		"game",
	],
	hold: [
		"tournament-logo",
		"tournament-name",
		"title",
		"countdown",
		"headline",
		"matchup-label",
	],
	matchup: [
		"matchup",
		"team",
		"team-logo",
		"team-seed",
		"team-name",
		"team-score",
		"round",
	],
	ticker: [
		"ticker",
		"ticker-label",
		"ticker-match",
		"ticker-round",
		"ticker-team",
		"ticker-team-seed",
		"ticker-team-name",
		"ticker-team-score",
	],
	stinger: [
		"stinger",
		"stinger-panel",
		"stinger-card",
		"stinger-teams",
		"stinger-team",
		"stinger-team-logo",
		"stinger-team-name",
		"stinger-team-score",
		"stinger-vs",
		"stinger-title-card",
		"stinger-tournament-logo",
		"stinger-header",
		"stinger-tournament-name",
		"stinger-round",
		"stinger-set-length",
	],
} as const;

export const BROADCAST_HEADLINE_MAX_LENGTH = 100;

// xxx: or 2?
export const BROADCAST_MAX_CASTERS = 3;

export const DEFAULT_CAST_BROADCAST_SETTINGS = {
	...DEFAULT_BROADCAST_SETTINGS,
	headline: "",
	casterIds: [],
} as const satisfies CastBroadcastSettings;

const DEFAULT_CAST_ITEM: Omit<CastProducerState, "id"> = {
	scene: "rosters",
	swapSides: false,
	transition: "stinger",
	bracketIdx: null,
	bracketFocus: "remaining",
	clipId: null,
	teamPick: "left",
	durationMs: null,
	advance: "timer",
};

/**
 * How the cast's producer moves between its scenes: rosters on air and game staged for when it starts on a new
 * broadcast, both with a stinger. The replays scene playing a clip lasts as long as the clip. The scenes showing the
 * featured match's teams don't go on air without one, starting soon is staged in their place.
 */
export const CAST_PRODUCER_RULES: Producer.Rules<CastProducerState> = {
	initial: {
		live: DEFAULT_CAST_ITEM,
		next: { ...DEFAULT_CAST_ITEM, scene: "game", advance: "game" },
	},
	sceneAfter: {
		starting: "casters",
		casters: "rosters",
		rosters: "game",
		maps: "game",
		game: "results",
		results: "maps",
		break: "game",
		replays: "game",
		bracket: "rosters",
		team: "rosters",
		technical: "game",
		ending: "starting",
	},
	gameScene: "game",
	defaultDurationMs: (scene) =>
		BROADCAST_SCENE_DURATIONS_MS[scene]?.defaultMs ?? null,
	lengthMs: (item) => {
		if (item.scene === "replays") {
			return (
				BROADCAST_PROTOTYPE_CLIPS.find((clip) => clip.id === item.clipId)
					?.durationMs ?? null
			);
		}

		return item.durationMs;
	},
	followedBy: (item) => ({ ...item, clipId: null }),
	needsMatch: (item) => needsFeaturedMatch(item.scene, item.teamPick),
	sceneWithoutMatch: "starting",
};
