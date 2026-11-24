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
 * Scenes without footage of their own to last as long as, which can be given one of these durations instead. They
 * stay on air until a Take unless the producer picks one. Starting soon counts its duration down on air.
 */
export const BROADCAST_SCENE_DURATIONS_MS: Partial<
	Record<CastScene, { optionsMs: readonly number[] }>
> = {
	starting: {
		optionsMs: [
			60_000, 120_000, 180_000, 300_000, 600_000, 900_000, 1_200_000, 1_800_000,
		],
	},
	results: {
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
	bracket: {
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
	team: {
		optionsMs: [10_000, 15_000, 20_000, 30_000, 45_000, 60_000],
	},
};

/**
 * Bracket scene focuses the theme designer previews: the rounds still being played of both sides (`remaining`), of
 * one side, or every round of both.
 */
export const BROADCAST_DESIGN_BRACKET_FOCUSES = [
	"remaining",
	"winners",
	"losers",
	"whole",
] as const;

/** Tabs of the dashboard's show settings under the switcher: the OBS setup, the music library and the theme. */
export const BROADCAST_DASHBOARD_TABS = ["setup", "music", "theme"] as const;

/** The staged item is highlighted for this long before it goes on air by itself. */
export const BROADCAST_AUTO_TAKE_IMMINENT_MS = 5_000;

/** A finished set stays in the other matches' ticker for this long after its last game. */
export const BROADCAST_FINISHED_SET_SHOWN_MS = 10 * 60_000;

/** With fewer other matches than this to show, the ticker is topped up with the most recently finished sets. */
export const BROADCAST_OTHER_MATCHES_MIN_COUNT = 5;

/** Longest replay clip the replays scene takes, the scanner's are at most a minute. */
export const BROADCAST_CLIP_MAX_DURATION_MS = 5 * 60_000;

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
	"NowPlaying",
] as const;

/** Screenshots of the game feed the designer can show under the overlay, by the gameplay they show (paths for `broadcastDesignImageUrl`). */
export const BROADCAST_DESIGN_FOOTAGE = {
	gameplay: "footage/gameplay.webp",
	minimap: "footage/minimap.webp",
	none: null,
} as const;

/** How long the designer's mock team and player names are, `mixed` being long and typical ones by turns. */
export const BROADCAST_DESIGN_NAME_LENGTHS = [
	"short",
	"typical",
	"long",
	"mixed",
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

/** The designer's transitions: the stinger as each of its variants, which on air follow the scenes it goes between. */
export const BROADCAST_DESIGN_TRANSITIONS = [
	"teamsStinger",
	"tournamentStinger",
	"fade",
	"cut",
] as const;

/** What the designer's now playing line shows: a track of the producer's music, their text in its place, or nothing. */
export const BROADCAST_DESIGN_NOW_PLAYING = ["track", "text", "none"] as const;

export const BROADCAST_DESIGN_MAX_PLAYERS = 4;

export const BROADCAST_DESIGN_MAX_OTHER_MATCHES = 8;

/** Scenes without gameplay, all drawn by the same full screen design. */
const BROADCAST_HOLD_SCENES = [
	"starting",
	"break",
	"technical",
	"ending",
] as const satisfies ReadonlyArray<(typeof BROADCAST_SCENES)[number]>;

/**
 * Scenes showing the now playing line, the producer's music being heard only while one of them is on air (faded out
 * and in as a Take goes to or from another scene).
 */
export const BROADCAST_MUSIC_SCENES: ReadonlyArray<
	(typeof BROADCAST_SCENES)[number]
> = [...BROADCAST_HOLD_SCENES, "casters"];

/** How long the music fades out or in as it stops or starts being heard. */
export const BROADCAST_MUSIC_FADE_MS = 1_500;

export const BROADCAST_NOW_PLAYING_MAX_LENGTH = 100;

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
 * `ticker` the other matches' scores along the bottom of the game and hold scenes, `now-playing` the producer's music
 * (`[data-source="track"]`) or their text in its place (`[data-source="text"]`) on the hold and casters scenes, `cameras` what the casters scene's frames show from under every scene (a caster's VDO.ninja camera, or their avatar as `caster-audio` with `[data-speaking]` while they speak) and `stinger` the transition over every scene. Every scene has a `backdrop` except game and replays, maps' with a `backdrop-video` of the next map under a `backdrop-vignette` darkening its edges.
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
		"caster-name",
		"caster-pronouns",
		"caster-url",
		"map-intro",
		"game-number",
		"mode",
		"stage",
		"scoreboard",
		"team",
		"nameplate",
		"team-logo",
		"team-title",
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
		"teams",
		"versus",
		"score",
		"team",
		"team-header",
		"team-logo",
		"team-name",
		"team-seed",
		"players",
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
		"games",
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
		"body",
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
		"caster-url",
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
		"content",
		"tournament-logo",
		"tournament-name",
		"title",
		"countdown",
		"headline",
		"matchup-label",
	],
	matchup: [
		"matchup",
		"versus",
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
		"ticker-final",
	],
	nowPlaying: [
		"now-playing",
		"now-playing-icon",
		"now-playing-title",
		"now-playing-artist",
		"now-playing-text",
	],
	cameras: [
		"caster-camera",
		"caster-camera-placeholder",
		"caster-audio",
		"caster-avatar",
		"caster-speaking-ring",
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
		"stinger-title-backdrop",
		"stinger-title-backdrop-row",
		"stinger-tournament-logo",
		"stinger-header",
		"stinger-tournament-name",
		"stinger-round",
		"stinger-set-length",
	],
} as const;

export const BROADCAST_HEADLINE_MAX_LENGTH = 100;

export const BROADCAST_MAX_CASTERS = 3;

export const BROADCAST_VDO_NINJA_URL_MAX_LENGTH = 500;

/** How loud a caster's camera is on air when nothing else is set, 0-100. */
export const BROADCAST_DEFAULT_CASTER_VOLUME = 100;

/** How often a dragged caster volume slider saves at most. */
export const BROADCAST_VOLUME_SAVE_INTERVAL_MS = 250;

/** Port OBS's WebSocket server listens on unless changed. */
export const BROADCAST_OBS_WEBSOCKET_DEFAULT_PORT = 4455;

export const BROADCAST_OBS_INPUT_NAME_MAX_LENGTH = 100;

export const BROADCAST_OBS_PASSWORD_MAX_LENGTH = 100;

export const DEFAULT_CAST_BROADCAST_SETTINGS = {
	...DEFAULT_BROADCAST_SETTINGS,
	headline: "",
	nowPlaying: "",
	casters: [],
} as const satisfies CastBroadcastSettings;

const DEFAULT_CAST_ITEM: Omit<CastProducerState, "id"> = {
	scene: "rosters",
	transition: "stinger",
	bracketIdx: null,
	bracketSides: { winners: "remaining", losers: "remaining" },
	clip: null,
	teamPick: "left",
	durationMs: null,
	advance: "timer",
	isAdvancePicked: false,
};

/**
 * How the cast's producer moves between its scenes: rosters on air and game staged for when it starts on a new
 * broadcast, both with a stinger. The replays scene playing a clip lasts as long as the clip. The scenes showing the
 * featured match's teams don't go on air without one, starting soon is staged in their place. Technical difficulties
 * stays on air until a Take, a game starting on the scanner's feed doesn't end it.
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
	lengthMs: (item) => {
		if (item.scene === "replays") return item.clip?.durationMs ?? null;

		return item.durationMs;
	},
	followedBy: (item) => ({ ...item, clip: null }),
	needsMatch: (item) => needsFeaturedMatch(item.scene, item.teamPick),
	sceneWithoutMatch: "starting",
	staysUntilTake: (scene) => scene === "technical",
};
