import type { ObjectiveTimelineEvent } from "~/components/ObjectiveTimeline";
import type { Pronouns } from "~/db/tables-json";
import type { StreamPlatform } from "~/features/live-streams/live-streams-constants";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	BROADCAST_ADVANCES,
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DESIGN_MESSAGE,
	BROADCAST_INK_COLORS,
	BROADCAST_SCENES,
	BROADCAST_STREAM_ROLES,
	BROADCAST_TRANSITIONS,
	BROADCAST_VIEWS,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";

export type BroadcastScene = (typeof BROADCAST_SCENES)[number];

export type BroadcastTransition = (typeof BROADCAST_TRANSITIONS)[number];

export type BroadcastAdvance = (typeof BROADCAST_ADVANCES)[number];

export type BroadcastBracketFocus = (typeof BROADCAST_BRACKET_FOCUSES)[number];

export type BroadcastWeaponImages = (typeof BROADCAST_WEAPON_IMAGES)[number];

export type BroadcastInkColorKey = (typeof BROADCAST_INK_COLORS)[number]["key"];

/** The teams' in-game ink colors. */
export interface BroadcastInk {
	key: BroadcastInkColorKey;
	/** The featured match's second team has the pair's first color. */
	isFlipped: boolean;
}

/** Ink colors of one game: the featured match's game played after its first `resultCount` results. */
interface BroadcastGameInk extends BroadcastInk {
	matchId: number;
	resultCount: number;
}

export type BroadcastView = (typeof BROADCAST_VIEWS)[number];

type BroadcastTeamPick = "left" | "right" | number;

export type BroadcastStreamRole = (typeof BROADCAST_STREAM_ROLES)[number];

/** What the producer controls of one scene: staged as `next` (or queued after it) and put on air as `live` by a Take. */
export interface ProducerState {
	/** Identifies the item as it moves from the queue to air, never reused (see `BroadcastStoredState.lastItemId`). */
	id: number;
	scene: BroadcastScene;
	/** Shows the featured match's second team on the left. */
	swapSides: boolean;
	/** How a Take puts this state on air, kept on `live` so the overlay knows how the last Take played. */
	transition: BroadcastTransition;
	/** Double elimination bracket of the bracket scene, `null` follows the featured match's. */
	bracketIdx: number | null;
	bracketFocus: BroadcastBracketFocus;
	/** Clip the replays scene plays, `null` leaves the footage under it to OBS. */
	clipId: string | null;
	/** Team of the team scene: one of the featured match's by its side (following the match cast), or any by its id. */
	teamPick: BroadcastTeamPick;
	/**
	 * How long the scene stays on air before the item after it can go on air by itself, `null` until a Take.
	 * The replays scene playing a clip lasts as long as the clip instead.
	 */
	durationMs: number | null;
	/** What puts it on air besides a Take, see `Producer.effectiveAdvance`. */
	advance: BroadcastAdvance;
}

export interface BroadcastStoredState {
	/** Incremented by every Take, a Take based on an older one is rejected. */
	takeId: number;
	/** When the last Take was made (epoch ms), what the live scene's length runs from. `null` before the first. */
	takenAt: number | null;
	live: ProducerState;
	next: ProducerState;
	/** Staged to go on air after `next`, in order. */
	queue: ProducerState[];
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
}

export interface LiveResults {
	matchId: number;
	count: number;
}

export interface BroadcastSettings {
	/** Injected unlayered after the overlays' own styles. */
	css: string;
	weaponImages: BroadcastWeaponImages;
	/** Message of the full screen scenes, e.g. "Top 8 starts at 18:00 CEST". */
	headline: string;
	/** Users under the camera frames of the casters scene, one frame per caster. */
	casterIds: number[];
}

/** The cast account a broadcast is for. */
export interface BroadcastChannel {
	platform: StreamPlatform;
	account: string;
	name: string;
	/** URL key of the broadcast, unique per tournament. */
	slug: string;
}

/** Full snapshot pushed to every client of a broadcast's stream. */
export interface BroadcastState extends BroadcastStoredState {
	v: 1;
	settings: BroadcastSettings;
	/** Users of `settings.casterIds` in order, ones that no longer exist left out. */
	casters: BroadcastCaster[];
	tournament: {
		name: string;
		logoUrl: string;
	};
	/** The match cast on the channel, or the next one locked for it. */
	match: BroadcastMatch | null;
	/** What the bracket scene shows in each view, `null` without a double elimination bracket to show. */
	bracket: Record<BroadcastView, BroadcastBracket | null>;
	/** What the team scene shows in each view, `null` when the view is on another scene or the team is not found. */
	team: Record<BroadcastView, BroadcastTeamSpotlight | null>;
	/** The tournament's other matches being played, what the "elsewhere" ticker shows. */
	otherMatches: BroadcastOtherMatch[];
	health: BroadcastHealth;
}

/** What the designer posts to its canvas to render. */
export interface BroadcastDesignMessage {
	type: typeof BROADCAST_DESIGN_MESSAGE;
	state: BroadcastState;
	/** Bumped to play the scene's transition again. */
	rehearsals: number;
}

export type BroadcastStreamMessage =
	| { kind: "state"; state: BroadcastState }
	| { kind: "heartbeat" }
	/** The server's code changed under the connection (dev server only), the client opens a new one. */
	| { kind: "reconnect" }
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
			/** The teams' ink colors as read off the game's HUD, in no particular order. `null` when not read. */
			inks: [BroadcastInkRgb, BroadcastInkRgb] | null;
	  }
	| { type: "end" };

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

/** A game as the scanner read it, what the results scene shows. */
export interface BroadcastGameResult {
	map: BroadcastMap;
	/** Index of the winning team in bracket order. */
	winner: 0 | 1;
	isKnockout: boolean;
	/** In bracket order. */
	teams: [BroadcastGameResultTeam, BroadcastGameResultTeam];
	/** Objective counter reads over the game, scores in bracket order. */
	objective: ObjectiveTimelineEvent[];
}

interface BroadcastGameResultTeam {
	/** 0-100, how much of the counter the team took. */
	score: number;
	players: BroadcastGameResultPlayer[];
}

interface BroadcastGameResultPlayer {
	/** In-game name. */
	name: string;
	weaponSplId: MainWeaponId;
	/** Main abilities of the head, clothes and shoes. */
	abilities: AbilityWithUnknown[];
}

export interface BroadcastTeam {
	id: number;
	name: string;
	logoUrl: string | null;
	seed: number | null;
	players: BroadcastPlayer[];
}

export interface BroadcastCaster {
	userId: number;
	name: string;
	pronouns: Pronouns | null;
}

export interface BroadcastPlayer {
	userId: number;
	name: string;
	avatarUrl: string | null;
	weapons: MainWeaponId[];
	/** Country code, e.g. "FI". */
	country: string | null;
}

/** What the bracket scene shows: a double elimination bracket, or one group of a round robin or Swiss bracket. */
export type BroadcastBracket =
	| BroadcastEliminationBracket
	| BroadcastRoundRobinBracket
	| BroadcastSwissBracket;

/** An elimination bracket (one group of it) laid out as the producer's focus shows it. */
export interface BroadcastEliminationBracket {
	type: "elimination";
	idx: number;
	name: string;
	/** Winners (ending with the grand finals) first, then losers. Only the sides in focus. Single elimination's one side is winners. */
	sides: BroadcastBracketSide[];
}

/** One group of a round robin or Swiss bracket, as far as the view shows the featured match. */
interface BroadcastGroupBracket {
	idx: number;
	name: string;
	/** E.g. 1 for group A, `null` when the bracket has only one group. */
	groupNumber: number | null;
	/**
	 * Runs of the standings shown, best first. Of a big group only the rows around the featured match's teams (or the
	 * top), two runs when its teams are far apart.
	 */
	standings: BroadcastStandingsRun[];
	/** Teams of the standings left out below the last run. */
	standingsHiddenBelow: number;
}

export interface BroadcastRoundRobinBracket extends BroadcastGroupBracket {
	type: "round_robin";
	/** Every round of the group, of a big group only the ones around the round being played. */
	rounds: BroadcastGroupRound[];
}

export interface BroadcastSwissBracket extends BroadcastGroupBracket {
	type: "swiss";
	/** The round shown: the featured match's, or else the last one paired. `null` before any is. */
	roundNumber: number | null;
	roundCount: number;
	/** The round's matches by the record their teams went into it with, best first. Byes left out. */
	pools: BroadcastSwissPool[];
}

interface BroadcastStandingsRun {
	/** Teams of the standings left out between the run before (or the top) and this one. */
	hiddenAbove: number;
	standings: BroadcastStanding[];
}

export interface BroadcastStanding {
	placement: number;
	team: BroadcastBracketTeam;
	setWins: number;
	setLosses: number;
	mapWins: number;
	mapLosses: number;
}

interface BroadcastGroupRound {
	id: number;
	/** 1 for the group's first round. */
	number: number;
	/** Byes left out. */
	matches: BroadcastBracketMatch[];
}

interface BroadcastSwissPool {
	wins: number;
	losses: number;
	matches: BroadcastBracketMatch[];
}

export interface BroadcastBracketSide {
	type: "winners" | "losers";
	/** Matches of the side's tallest round, every round's matches spread over this many slots. */
	slotCount: number;
	rounds: BroadcastBracketRound[];
}

export interface BroadcastBracketRound {
	id: number;
	/** E.g. "WB Semis" or "Grand Finals". */
	name: string;
	/** How its matches lead to the next round's: two into one or one to one, `null` for the side's last round. */
	connector: "pairs" | "straight" | null;
	/** `null` is a bye, kept in so the matches line up with the rounds next to them. */
	matches: Array<BroadcastBracketMatch | null>;
}

export interface BroadcastBracketMatch {
	id: number;
	/** In bracket order, `null` when not decided yet. */
	teams: [BroadcastBracketTeam | null, BroadcastBracketTeam | null];
	/** In bracket order, `null` before the set started. */
	scores: [number, number] | null;
	/** Index of the winning team in bracket order. */
	winner: 0 | 1 | null;
	isFeatured: boolean;
	/** Connected to a match of the previous round shown, which a team advances from. */
	isFed: boolean;
}

/** One team's tournament so far, what the team scene shows. */
export interface BroadcastTeamSpotlight {
	team: BroadcastTeam;
	/** Over the sets played, as far as the view shows the featured match. */
	record: BroadcastTeamRecord;
	/** Games won and lost per mode, in the modes' usual order. Modes not played are left out, all of them in a one mode tournament. */
	modes: Array<{ mode: ModeShort; wins: number; losses: number }>;
	/** Maps the team picked for the tournament's map lists, empty when teams don't pick maps. */
	mapPool: BroadcastMap[];
	/** In the order the team played them, ending with the set being played or the next one when known. */
	sets: BroadcastTeamSet[];
}

export interface BroadcastTeamRecord {
	setWins: number;
	setLosses: number;
	mapWins: number;
	mapLosses: number;
}

export interface BroadcastTeamSet {
	matchId: number;
	/** E.g. "Main bracket · WB Semis", see `roundLabel`. */
	roundLabel: string;
	/** `null` when not decided yet. */
	opponent: BroadcastBracketTeam | null;
	/** The team's first. */
	scores: [number, number];
	status: "win" | "loss" | "live" | "upcoming";
	/** Reported games in playing order. */
	games: Array<BroadcastMap & { isWin: boolean }>;
}

export interface BroadcastOtherMatch {
	id: number;
	/** E.g. "WB Semis". */
	roundName: string | null;
	/** In bracket order, `null` when not decided yet. */
	teams: [BroadcastOtherMatchTeam | null, BroadcastOtherMatchTeam | null];
	/** In bracket order. */
	scores: [number, number];
	/** Index of the winning team in bracket order, `null` while the set is being played. */
	winner: 0 | 1 | null;
}

export type BroadcastOtherMatchTeam = Pick<BroadcastTeam, "name" | "seed">;

export type BroadcastBracketTeam = Pick<
	BroadcastTeam,
	"id" | "name" | "logoUrl" | "seed"
>;
