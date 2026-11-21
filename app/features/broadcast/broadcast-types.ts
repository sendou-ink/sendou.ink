import type { StreamPlatform } from "~/features/live-streams/live-streams-constants";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	BROADCAST_ADVANCES,
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_INK_COLORS,
	BROADCAST_STREAM_ROLES,
	BROADCAST_TRANSITIONS,
	BROADCAST_VIEWS,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";

export type BroadcastTransition = (typeof BROADCAST_TRANSITIONS)[number];

/** What a stinger shows: the featured match's teams, or the tournament's own title card. */
export type BroadcastStingerVariant = "teams" | "tournament";

export type BroadcastAdvance = (typeof BROADCAST_ADVANCES)[number];

export type BroadcastWeaponImages = (typeof BROADCAST_WEAPON_IMAGES)[number];

export type BroadcastInkColorKey = (typeof BROADCAST_INK_COLORS)[number]["key"];

/** The teams' in-game ink colors, the pair's first one Alpha's (see {@link ProducerState.swapSides}). */
export interface BroadcastInk {
	key: BroadcastInkColorKey;
}

/** Ink colors of one game: the featured match's game played after its first `resultCount` results. */
interface BroadcastGameInk extends BroadcastInk {
	matchId: number;
	resultCount: number;
}

export type BroadcastView = (typeof BROADCAST_VIEWS)[number];

export type BroadcastStreamRole = (typeof BROADCAST_STREAM_ROLES)[number];

/**
 * What the producer controls of one scene: staged as `next` (or queued after it) and put on air as `live` by a Take.
 * A scene set's items add the fields its scenes are set up with (see `Producer.Rules`).
 */
export interface ProducerState<Scene extends string = string> {
	/** Identifies the item as it moves from the queue to air, never reused (see `BroadcastStoredState.lastItemId`). */
	id: number;
	scene: Scene;
	/**
	 * Shows the featured match's second team on the left. The left team is Alpha (the game's HUD has it on the left,
	 * in the ink pair's first color), so it also says which team has which ink color.
	 */
	swapSides: boolean;
	/** How a Take puts this state on air, kept on `live` so the overlay knows how the last Take played. */
	transition: BroadcastTransition;
	/** How long the scene stays on air before the item after it can go on air by itself, `null` until a Take. */
	durationMs: number | null;
	/** What puts it on air besides a Take, see `Producer.effectiveAdvance`. */
	advance: BroadcastAdvance;
}

export interface BroadcastStoredState<
	Item extends ProducerState = ProducerState,
> {
	/** Incremented by every Take, a Take based on an older one is rejected. */
	takeId: number;
	/** When the last Take was made (epoch ms), what the live scene's length runs from. `null` before the first. */
	takenAt: number | null;
	live: Item;
	next: Item;
	/** Staged to go on air after `next`, in order. */
	queue: Item[];
	/** Id of the last item created, the next one created gets the one after it. */
	lastItemId: number;
	/**
	 * How many of the featured match's reported results are on air, so a result reported before the stream
	 * showed the game doesn't spoil it. Set by a Take or "show now". `null` (or another match) shows all of them.
	 */
	liveResults: LiveResults | null;
	/**
	 * Colors the in-game scoreboard, set while the game is on air as the colors are only known once it starts.
	 * Other games, and every other scene, use the theme's team colors.
	 */
	ink: BroadcastGameInk | null;
	/** The last game the scanner read to its end, what the scenes after a game show of it. */
	scannedGame: BroadcastScannedGame | null;
}

/** A game of the featured match as the scanner read it, whichever of the set's games it was. */
export interface BroadcastScannedGame extends BroadcastGameSummary {
	matchId: number;
	/** The game played after the match's first `resultCount` results, its ink being `BroadcastStoredState.ink` of the same. */
	resultCount: number;
	/** Ink colors picked for the game when it ended, `null` when none were. */
	ink: BroadcastInk | null;
}

export interface LiveResults {
	matchId: number;
	count: number;
}

/** Settings of every broadcast, a scene set's settings add their own. */
export interface BroadcastSettings {
	/** Injected unlayered after the overlays' own styles. */
	css: string;
	weaponImages: BroadcastWeaponImages;
}

/** How the OBS browser source reaches the capture card through OBS's WebSocket server (obs-websocket). */
export interface BroadcastObsAudio {
	/** Name of the capture card's source in OBS. */
	inputName: string;
	port: number;
	/** `null` when the WebSocket server asks for none. */
	password: string | null;
}

/** The cast account a broadcast is for. */
export interface BroadcastChannel {
	platform: StreamPlatform;
	account: string;
	name: string;
	/** URL key of the broadcast, unique per tournament. */
	slug: string;
}

/** Full snapshot pushed to every client of a broadcast's stream, a scene set's state adds what its scenes show. */
export interface BroadcastState<
	Item extends ProducerState = ProducerState,
	Settings extends BroadcastSettings = BroadcastSettings,
> extends BroadcastStoredState<Item> {
	v: 1;
	settings: Settings;
	tournament: {
		name: string;
		logoUrl: string;
		/** Name of the organization hosting the tournament, `null` without one. */
		organizationName: string | null;
	};
	/** The match the broadcast features, e.g. the one cast on the channel or the next one locked for it. */
	match: BroadcastMatch | null;
	health: BroadcastHealth;
}

/** What the designer posts to its canvas to render. */
export interface BroadcastDesignMessage<
	State extends BroadcastState = BroadcastState,
> {
	type: typeof BROADCAST_DESIGN_MESSAGE;
	state: State;
	/** Bumped to play the scene's transition again. */
	rehearsals: number;
	/** The stinger to play whatever the scenes, the designer previewing either. */
	stinger: BroadcastStingerVariant;
}

export type BroadcastStreamMessage<
	State extends BroadcastState = BroadcastState,
> =
	| { kind: "state"; state: State }
	| { kind: "heartbeat" }
	/** The server's code changed under the connection (dev server only), the client opens a new one. */
	| { kind: "reconnect" }
	/** The OBS URL the page was opened from now shows another broadcast, the page loads again. */
	| { kind: "reload" }
	/** The OBS URL the page was opened from now mutes the capture card this way. */
	| { kind: "obsAudio"; obsAudio: BroadcastObsAudio | null }
	/**
	 * First message of every connection: who it is when signaling the clip peer connections, and the server's clock
	 * (epoch ms) to time the scenes by.
	 */
	| { kind: "hello"; peer: BroadcastOwnPeer; now: number }
	/** To clip senders only, whenever a client connects or disconnects. */
	| { kind: "peers"; peers: BroadcastPeer[] }
	| { kind: "signal"; from: string; description: BroadcastSessionDescription };

export interface BroadcastPeer {
	id: string;
	/** Scanners show no overlay, so get no clips. */
	role: Exclude<BroadcastStreamRole, "scanner">;
}

export interface BroadcastOwnPeer {
	id: string;
	/** Proves the signals it posts are its own, the peer ids being known to others. */
	token: string;
}

/** Offer or answer of a clip peer connection, ICE candidates included (no trickle). */
export interface BroadcastSessionDescription {
	type: "offer" | "answer";
	sdp: string;
}

/** A sound an OBS overlay plays, e.g. a caster's VDO.ninja camera, as the overlay reports it to the dashboards. */
export interface BroadcastAudioFeed {
	/** E.g. the caster's user id. */
	id: number;
	isConnected: boolean;
	/** Loudest since the overlay's last report, as VDO.ninja measures it (0 silent, ~100 loudest). */
	loudness: number;
}

export interface BroadcastHealth {
	/** OBS browser sources showing the overlay. */
	sources: number;
	/** Scanners watching the game feed, which put items waiting for a game to start or end on air. */
	scanners: number;
}

/** What the scanner watching the game feed saw, see `Producer.applyGameSignal`. */
export type BroadcastGameSignal =
	| {
			type: "start";
			/** The teams' ink colors as read off the game's HUD, in no particular order. `null` when not read (yet). */
			inks: [BroadcastInkRgb, BroadcastInkRgb] | null;
	  }
	/** The ink of a game that started without it, once read. */
	| { type: "ink"; inks: [BroadcastInkRgb, BroadcastInkRgb] }
	| {
			type: "end";
			/** What the scanner read of the game, `null` when it has nothing of it (e.g. a misread intro), which cuts nothing. */
			summary: BroadcastGameSummary | null;
	  };

/**
 * A game as the scanner read it off the game feed, trimmed to what the overlays show of it. Its teams are in the
 * scanner's order, which `inks` tells apart.
 */
export interface BroadcastGameSummary {
	mode: ModeShort | null;
	stageId: StageId | null;
	/** Ended before the timer ran out. */
	isKnockout: boolean;
	/** Index of the winning team when the scanner read it off a results screen, which casts never show. */
	winner: 0 | 1 | null;
	/** Each team's ink color as the minimap showed it, `null` when not read. */
	inks: [BroadcastInkRgb | null, BroadcastInkRgb | null];
	teams: [BroadcastGameSummaryTeam, BroadcastGameSummaryTeam];
	/** Counter reads over the game in order, empty without (e.g. turf war). */
	objective: BroadcastObjectiveRead[];
}

interface BroadcastGameSummaryTeam {
	/** Up to 4, the ones the scanner never saw left out. */
	players: BroadcastGameSummaryPlayer[];
}

export interface BroadcastGameSummaryPlayer {
	/** In-game name, `null` when not read. */
	name: string | null;
	weaponSplId: MainWeaponId | null;
	/** Main abilities of the head, clothes and shoes, empty when none were read. */
	abilities: AbilityWithUnknown[];
}

/** One read of the objective counter. */
export interface BroadcastObjectiveRead {
	/** Seconds into the game. */
	t: number;
	/** The count each team has left to go, `null` when not read. */
	score: [number | null, number | null];
	/** Index of the team holding the objective, `null` for neither. */
	control: 0 | 1 | null;
}

/** A team's ink color as read off the game's HUD, channels 0-255. */
export interface BroadcastInkRgb {
	r: number;
	g: number;
	b: number;
}

export interface BroadcastMatch {
	id: number;
	/** `null` when the tournament has only one bracket. */
	bracketName: string | null;
	roundName: string | null;
	countType: "BEST_OF" | "PLAY_ALL";
	count: number;
	/** In bracket order: `opponentOne` first. `null` when not decided yet. */
	teams: [BroadcastTeam | null, BroadcastTeam | null];
	/** As on air (`live`) and as reported (`next`, which a Take puts on air). */
	progress: Record<BroadcastView, MatchProgress>;
}

/** How far the set is, counted from its first `resultCount` reported results. */
export interface MatchProgress {
	resultCount: number;
	/** In bracket order. */
	scores: [number, number];
	isOver: boolean;
	/** Game being played or about to be, the last one once the set is over. */
	gameNumber: number;
	/** `null` when not picked yet or the set is over. */
	currentMap: BroadcastMap | null;
	/** Every game the set can have, e.g. 5 for a Bo5, in playing order. */
	games: BroadcastGame[];
}

export interface BroadcastMap {
	mode: ModeShort;
	stageId: StageId;
}

export interface BroadcastGame {
	/** `null` when not picked yet, or for a game the set ended before. */
	map: BroadcastMap | null;
	/** Index of the winning team in bracket order, `null` when not played yet. */
	winner: 0 | 1 | null;
}

export interface BroadcastTeam {
	id: number;
	name: string;
	logoUrl: string | null;
	seed: number | null;
	players: BroadcastPlayer[];
}

export interface BroadcastPlayer {
	userId: number;
	name: string;
	avatarUrl: string | null;
	weapons: MainWeaponId[];
	/** Country code, e.g. "FI". */
	country: string | null;
}
