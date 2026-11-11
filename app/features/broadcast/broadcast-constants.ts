import type { BroadcastSettings, BroadcastTransition } from "./broadcast-types";

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

/** Weapon images of the overlays: the plain ones or the ones with a white outline as on badges. */
export const BROADCAST_WEAPON_IMAGES = ["default", "outlined"] as const;

/** Which producer state an overlay page renders: what is on air or what is staged for the next Take. */
export const BROADCAST_VIEWS = ["live", "next"] as const;

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

/** Overlay URLs are public, so connections per broadcast are capped. */
export const BROADCAST_MAX_CONNECTIONS = 40;

export const BROADCAST_CSS_MAX_LENGTH = 20_000;

/** Posted by the dashboard to its Next preview, which plays the staged transition. */
export const BROADCAST_REHEARSE_MESSAGE = "broadcast:rehearse";

/** Overlay canvas size, OBS browser sources are set to this. */
export const BROADCAST_CANVAS = { width: 1920, height: 1080 } as const;

/** Posted by the designer to its canvas with the state to render, see `BroadcastDesignMessage`. */
export const BROADCAST_DESIGN_MESSAGE = "broadcast:design";

/** Posted by the designer's canvas once it listens for {@link BROADCAST_DESIGN_MESSAGE}. */
export const BROADCAST_DESIGN_READY_MESSAGE = "broadcast:design-ready";

export const DEFAULT_BROADCAST_SETTINGS = {
	css: "",
	weaponImages: "default",
} as const satisfies BroadcastSettings;

export const BROADCAST_WEAPONS_PER_PLAYER = 3;

/** Days the producers' chat lives from the tournament's start, or from when the channel was set if that's later. */
export const BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 7;

export const LEAGUE_BROADCAST_CHAT_ROOM_LIFESPAN_DAYS = 60;
