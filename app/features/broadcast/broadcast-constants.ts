import type {
	BroadcastGameResult,
	BroadcastScene,
	BroadcastSettings,
	BroadcastTransition,
} from "./broadcast-types";

/** Scenes the overlay can show. */
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

// xxx: do we want all of these?
/** How a Take puts the staged state on air, in the order of the dashboard's transition buttons. */
export const BROADCAST_TRANSITIONS = ["stinger", "fade", "cut"] as const;

/**
 * When a Take changes the scene with each transition in the default theme's timing: `inMs` from the Take to the new
 * scene starting (once the stinger covers the screen), `outMs` from the Take to the old scene being hidden. Automatic
 * Takes are timed with these so a scene's end is hidden, a theme retiming its transitions moves them off by the difference.
 */
export const BROADCAST_TRANSITION_TIMING = {
	stinger: { inMs: 704, outMs: 704 },
	fade: { inMs: 0, outMs: 400 },
	cut: { inMs: 0, outMs: 0 },
} as const satisfies Record<
	BroadcastTransition,
	{ inMs: number; outMs: number }
>;

/**
 * Scenes without footage of their own to last as long as, which can be given a duration instead: the one they get
 * when picked (`null` until a Take) and the ones the dashboard offers. Starting soon counts its duration down on air.
 * The others stay on air until a Take.
 */
export const BROADCAST_SCENE_DURATIONS_MS: Partial<
	Record<
		BroadcastScene,
		{ defaultMs: number | null; optionsMs: readonly number[] }
	>
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
 * Splatoon 3's ink color pairs, the first team's color first. Picking one colors the game scoreboard's teams as
 * they are in game, otherwise the theme's team colors are used. `a`/`b` from IPL's ipl-overlay-controls (MIT).
 * `referenceA`/`referenceB` are how the scanner reads them off the HUD's player icons (per-channel median, the
 * median over games of cast and POV VoDs): darker than `a`/`b`, and a few CIEDE2000 off IPL's clean-feed samples.
 * Color Lock is the viewing console's setting, so it holds for every game of a broadcast.
 */
export const BROADCAST_INK_COLORS = [
	{
		key: "lockYellowPurple",
		a: "#F0EB24",
		b: "#6236DF",
		referenceA: "#C3BB31",
		referenceB: "#4E35AC",
		isColorLock: true,
	},
	{
		key: "lockOrangeBlue",
		a: "#FDB605",
		b: "#2D63D7",
		referenceA: "#C68F28",
		referenceB: "#2657B2",
		isColorLock: true,
	},
	{
		key: "orangePurple",
		a: "#F56522",
		b: "#821CD6",
		referenceA: "#BF5624",
		referenceB: "#661FA4",
		isColorLock: false,
	},
	{
		key: "yellowDarkBlue",
		a: "#EDD921",
		b: "#461EE6",
		referenceA: "#C8BD25",
		referenceB: "#3C22B8",
		isColorLock: false,
	},
	{
		key: "turquoiseOrange",
		a: "#2ADBC6",
		b: "#FA5A41",
		referenceA: "#28C1AD",
		referenceB: "#CA543B",
		isColorLock: false,
	},
	{
		key: "orangeDarkBlue",
		a: "#FC7735",
		b: "#4048DB",
		referenceA: "#CE6B36",
		referenceB: "#3B41B4",
		isColorLock: false,
	},
	{
		key: "turquoisePink",
		a: "#2ADBC3",
		b: "#E34984",
		referenceA: "#33BBA7",
		referenceB: "#C23D6F",
		isColorLock: false,
	},
	{
		key: "darkBlueOrange",
		a: "#2C2CDB",
		b: "#F29C33",
		referenceA: "#2624A2",
		referenceB: "#D19038",
		isColorLock: false,
	},
	{
		key: "yellowPurple",
		a: "#EEFC58",
		b: "#7635F0",
		referenceA: "#C0CB48",
		referenceB: "#5F31BA",
		isColorLock: false,
	},
	{
		key: "goldPurple",
		a: "#EBCC31",
		b: "#A032DB",
		referenceA: "#CAB32E",
		referenceB: "#9136B7",
		isColorLock: false,
	},
	{
		key: "greenPink",
		a: "#B3DE45",
		b: "#D43BCA",
		referenceA: "#A4C744",
		referenceB: "#AC37A4",
		isColorLock: false,
	},
	{
		key: "pinkGreen",
		a: "#F753A1",
		b: "#35CC2D",
		referenceA: "#C13375",
		referenceB: "#45B729",
		isColorLock: false,
	},
] as const;

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

/** Weapon images of the overlays: the plain ones or the ones with a white outline as on badges. */
export const BROADCAST_WEAPON_IMAGES = ["default", "outlined"] as const;

/** Which producer state an overlay page renders: what is on air or what is staged for the next Take. */
export const BROADCAST_VIEWS = ["live", "next"] as const;

/** Tabs of the dashboard's show settings under the switcher: the OBS setup and the theme. */
export const BROADCAST_DASHBOARD_TABS = ["setup", "theme"] as const;

/** Kind of client connected to a broadcast's stream, counted separately for the dashboard's health. */
export const BROADCAST_STREAM_ROLES = [
	"source",
	"preview",
	"dashboard",
	"scanner",
] as const;

/**
 * What puts a staged item on air besides a Take: the scene before it running its length (`timer`), or the scanner
 * seeing the game start or end (`game`, see `Producer.gameCue`).
 */
export const BROADCAST_ADVANCES = ["take", "timer", "game"] as const;

/** Session descriptions are a few kilobytes, more so with many ICE candidates. */
export const BROADCAST_SDP_MAX_LENGTH = 50_000;

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

// xxx: prototype, the scanner reads these off the game's end screens eventually
/** Counter reads of the prototype game: seconds into the game, alpha's and bravo's count, who held the objective. */
const PROTOTYPE_OBJECTIVE: Array<[number, number, number, 0 | 1 | null]> = [
	[0, 100, 100, null],
	[10, 100, 100, null],
	[20, 100, 100, 0],
	[30, 92, 100, 0],
	[40, 84, 100, 0],
	[50, 76, 100, 0],
	[60, 70, 100, 1],
	[70, 70, 94, 1],
	[80, 70, 86, 1],
	[90, 70, 78, 1],
	[100, 70, 72, null],
	[110, 70, 72, 0],
	[120, 63, 72, 0],
	[130, 55, 72, 0],
	[140, 47, 72, 0],
	[150, 40, 72, 0],
	[160, 36, 72, null],
	[170, 36, 72, 1],
	[180, 36, 64, 1],
	[190, 36, 57, 1],
	[200, 36, 50, 1],
	[210, 36, 45, null],
	[220, 36, 45, 0],
	[230, 29, 45, 0],
	[240, 22, 45, 0],
	[250, 16, 45, 0],
	[260, 14, 45, 1],
	[270, 14, 41, 1],
	[280, 14, 41, null],
	[290, 12, 41, 0],
	[300, 12, 41, 0],
];

// xxx: prototype, the scanner reads these off the game's end screens eventually
/** Game the results scene shows, its teams in the featured match's bracket order. */
export const BROADCAST_PROTOTYPE_GAME_RESULT: BroadcastGameResult = {
	map: { mode: "SZ", stageId: 10 },
	winner: 0,
	isKnockout: false,
	teams: [
		{
			score: 88,
			players: [
				{
					name: "Noodle",
					weaponSplId: 40,
					abilities: ["LDE", "RSU", "SJ"],
				},
				{
					name: "InkJet",
					weaponSplId: 2010,
					abilities: ["CB", "ISM", "SJ"],
				},
				{
					name: "Squidly",
					weaponSplId: 3010,
					abilities: ["LDE", "SSU", "OS"],
				},
				{
					name: "Marina♪",
					weaponSplId: 1010,
					abilities: ["OG", "NS", "SSU"],
				},
			],
		},
		{
			score: 59,
			players: [
				{
					name: "Kraken",
					weaponSplId: 8000,
					abilities: ["LDE", "RP", "SJ"],
				},
				{
					name: "Blitz",
					weaponSplId: 4010,
					abilities: ["CB", "RSU", "SJ"],
				},
				{
					name: "Mochi",
					weaponSplId: 5010,
					abilities: ["LDE", "QR", "SJ"],
				},
				{
					name: "Zap",
					weaponSplId: 6010,
					abilities: ["ISM", "SPU", "SJ"],
				},
			],
		},
	],
	objective: PROTOTYPE_OBJECTIVE.map(([t, alpha, bravo, control]) => ({
		t,
		data: {
			time: 300 - t,
			score: [alpha, bravo],
			penalty: [null, null],
			control,
		},
	})),
};

/** Overlay URLs are public, so connections per broadcast are capped. */
export const BROADCAST_MAX_CONNECTIONS = 40;

export const BROADCAST_CSS_MAX_LENGTH = 20_000;

/** Posted by the dashboard to its Next preview, which plays the staged transition. */
export const BROADCAST_REHEARSE_MESSAGE = "broadcast:rehearse";

/** Overlay canvas size, OBS browser sources are set to this. */
export const BROADCAST_CANVAS = { width: 1920, height: 1080 } as const;

// xxx: maybe some sort of grid system in the theming so people can also move elements around
/** CSS custom properties the overlays are themed with, overridable from the custom CSS on `[data-broadcast]`. */
export const BROADCAST_THEME_TOKENS = [
	"--bc-bg",
	"--bc-surface",
	"--bc-surface-high",
	"--bc-border",
	"--bc-text",
	"--bc-text-muted",
	"--bc-accent",
	"--bc-accent-text",
	"--bc-alert",
	"--bc-team-a",
	"--bc-team-b",
	"--bc-team-a-text",
	"--bc-team-b-text",
	"--bc-font-display",
	"--bc-font-body",
	"--bc-weight-semibold",
	"--bc-weight-bold",
	"--bc-weight-heavy",
	"--bc-radius",
	"--bc-radius-small",
	"--bc-border-width",
	"--bc-ease",
	"--bc-ease-in",
	"--bc-stinger-ease",
	"--bc-enter-duration",
	"--bc-enter-distance",
	"--bc-stagger",
	"--bc-transition-duration",
	"--bc-stinger-duration",
	"--bc-stinger-covered-at",
	"--bc-stinger-reveal-at",
	"--bc-stinger-entrance-at",
] as const;

/**
 * The overlays' stylesheets the designer lays out for editing, in its order, named after their `.module.css` files in
 * `components/`. Their classes are `.{stylesheet}-{class}` in the custom CSS, e.g. `.GameScene-infoCard`.
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

/** Posted by the designer to its canvas with the state to render, see `BroadcastDesignMessage`. */
export const BROADCAST_DESIGN_MESSAGE = "broadcast:design";

/** Posted by the designer's canvas once it listens for {@link BROADCAST_DESIGN_MESSAGE}. */
export const BROADCAST_DESIGN_READY_MESSAGE = "broadcast:design-ready";

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
export const BROADCAST_HOLD_SCENES = [
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

/**
 * Global keyframes the overlays animate with, documented in `feature-readmes/broadcast.mdx`. Each is used through
 * its `--bc-anim-*` token (`bc-enter` through `--bc-anim-enter`). Redefining the keyframes in the custom CSS changes
 * every element using it, pointing the token at other keyframes changes the elements under where it is set.
 * Renaming one breaks users' themes.
 */
export const BROADCAST_KEYFRAMES = [
	"bc-enter",
	"bc-exit",
	"bc-reveal",
	"bc-count",
	"bc-pulse",
	"bc-fade-in",
	"bc-fade-out",
	"bc-alert-slide",
	"bc-ticker",
	"bc-panel-slide-in",
	"bc-panel-slide-out",
	"bc-panel-iris-in",
	"bc-panel-iris-out",
	"bc-camera",
	"bc-dim",
	"bc-glow",
] as const;

export const DEFAULT_BROADCAST_SETTINGS = {
	css: "",
	weaponImages: "default",
	headline: "",
	casterIds: [],
} as const satisfies BroadcastSettings;

export const BROADCAST_HEADLINE_MAX_LENGTH = 100;

// xxx: or 2?
export const BROADCAST_MAX_CASTERS = 3;

export const BROADCAST_WEAPONS_PER_PLAYER = 3;

/** Days the producers' chat lives from the tournament's start, or from when the channel was set if that's later. */
export const BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 7;

export const LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 60;
