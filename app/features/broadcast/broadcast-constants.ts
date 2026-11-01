import type { BroadcastSettings } from "./broadcast-types";

/** Scenes the overlay can show, in the order of the dashboard's scene buttons. */
export const BROADCAST_SCENES = [
	"starting",
	"casters",
	"rosters",
	"maps",
	"game",
	"break",
	"replays",
	"bracket",
	"technical",
	"ending",
] as const;

// xxx: do we want all of these?
/** How a Take puts the staged state on air, in the order of the dashboard's transition buttons. */
export const BROADCAST_TRANSITIONS = ["stinger", "fade", "cut"] as const;

/**
 * Splatoon 3's ink color pairs, the first team's color first. Picking one colors the teams as they are in game,
 * otherwise the theme's team colors are used. Values from IPL's ipl-overlay-controls (MIT).
 */
export const BROADCAST_INK_COLORS = [
	{ key: "lockYellowPurple", a: "#F0EB24", b: "#6236DF" },
	{ key: "lockOrangeBlue", a: "#FDB605", b: "#2D63D7" },
	{ key: "orangePurple", a: "#F56522", b: "#821CD6" },
	{ key: "yellowDarkBlue", a: "#EDD921", b: "#461EE6" },
	{ key: "turquoiseOrange", a: "#2ADBC6", b: "#FA5A41" },
	{ key: "orangeDarkBlue", a: "#FC7735", b: "#4048DB" },
	{ key: "turquoisePink", a: "#2ADBC3", b: "#E34984" },
	{ key: "darkBlueOrange", a: "#2C2CDB", b: "#F29C33" },
	{ key: "yellowPurple", a: "#EEFC58", b: "#7635F0" },
	{ key: "goldPurple", a: "#EBCC31", b: "#A032DB" },
	{ key: "greenPink", a: "#B3DE45", b: "#D43BCA" },
	{ key: "pinkGreen", a: "#F753A1", b: "#35CC2D" },
] as const;

/** Weapon images of the overlays: the plain ones or the ones with a white outline as on badges. */
export const BROADCAST_WEAPON_IMAGES = ["default", "outlined"] as const;

/** Which producer state an overlay page renders: what is on air or what is staged for the next Take. */
export const BROADCAST_VIEWS = ["live", "next"] as const;

/** Kind of client connected to a broadcast's stream, counted separately for the dashboard's OBS health. */
export const BROADCAST_STREAM_ROLES = [
	"source",
	"preview",
	"dashboard",
] as const;

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
	"--bc-team-a",
	"--bc-team-b",
	"--bc-team-a-text",
	"--bc-team-b-text",
	"--bc-font-display",
	"--bc-font-body",
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
] as const;

/** Scenes without gameplay, all drawn by the same full screen design. */
export const BROADCAST_HOLD_SCENES = [
	"starting",
	"break",
	"bracket",
	"technical",
	"ending",
] as const satisfies ReadonlyArray<(typeof BROADCAST_SCENES)[number]>;

/**
 * Stable `data-part` hooks of each design for custom CSS, e.g. `[data-scene="game"] [data-part="team-name"]`.
 * `hold` is the design of {@link BROADCAST_HOLD_SCENES}, `matchup` the featured match line some scenes show and
 * `stinger` the transition over every scene. Every scene has a `backdrop` except game and replays, maps' with a `backdrop-video` of the next map.
 * Renaming one breaks users' themes.
 */
export const BROADCAST_SCENE_PARTS = {
	game: [
		"scoreboard",
		"team",
		"team-name",
		"team-score",
		"map-intro",
		"game-number",
		"mode",
		"stage",
		"info-bar",
		"info-row",
		"casters",
		"mic",
		"round",
		"tournament-logo",
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
	casters: [
		"header",
		"tournament-name",
		"title",
		"camera",
		"caster-name",
		"caster-pronouns",
	],
	replays: ["corner", "replay-bug", "replay-dot", "replay-label", "game"],
	hold: [
		"tournament-logo",
		"tournament-name",
		"title",
		"headline",
		"matchup-label",
	],
	matchup: ["matchup", "team", "team-logo", "team-name", "team-score", "round"],
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
	"bc-zoom",
	"bc-fade-in",
	"bc-fade-out",
	"bc-alert-slide",
	"bc-panel-slide-in",
	"bc-panel-slide-out",
	"bc-panel-iris-in",
	"bc-panel-iris-out",
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
