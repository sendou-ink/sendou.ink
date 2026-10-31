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

/** Overlay canvas size, OBS browser sources are set to this. */
export const BROADCAST_CANVAS = { width: 1920, height: 1080 } as const;

// xxx: maybe some sort of grid system in the theming so people can also move elements around
// xxx: theming option for changing which weapon images are used
/** CSS custom properties the overlays are themed with, overridable from the custom CSS. */
export const BROADCAST_THEME_TOKENS = [
	"--bc-accent",
	"--bc-bg",
	"--bc-surface",
	"--bc-text",
	"--bc-text-muted",
	"--bc-team-a",
	"--bc-team-b",
	"--bc-font-display",
	"--bc-font-body",
	"--bc-radius",
	"--bc-transition-duration",
] as const;

/**
 * Stable `data-part` hooks of each designed scene for custom CSS, e.g. `[data-scene="game"] [data-part="team-name"]`.
 * Renaming one breaks users' themes.
 */
export const BROADCAST_SCENE_PARTS = {
	rosters: [
		"header",
		"tournament-logo",
		"round",
		"team",
		"team-logo",
		"team-name",
		"player",
		"player-avatar",
		"player-name",
		"player-weapons",
	],
	game: [
		"scorebug",
		"team",
		"team-logo",
		"team-name",
		"team-score",
		"game-info",
		"round",
		"game-count",
		"mode",
		"stage",
		"tournament-logo",
	],
} as const;

export const DEFAULT_BROADCAST_SETTINGS = { css: "" } as const;

export const DEFAULT_BROADCAST_OVERRIDES = { teams: {}, players: {} } as const;

export const BROADCAST_WEAPONS_PER_PLAYER = 3;

export const BROADCAST_PLAYER_NAME_MAX_LENGTH = 32;

/** Upper bound of the edit form's roster, rosters are capped well below by the tournament. */
export const BROADCAST_MAX_PLAYERS_PER_TEAM = 20;

/** Days the producers' chat lives from the tournament's start, or from when the channel was set if that's later. */
export const BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 7;

export const LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 60;
