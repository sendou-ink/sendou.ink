import type { Pronouns } from "~/db/tables-json";
import type { StreamPlatform } from "~/features/live-streams/live-streams-constants";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_INK_COLORS,
	BROADCAST_SCENES,
	BROADCAST_STREAM_ROLES,
	BROADCAST_TRANSITIONS,
	BROADCAST_VIEWS,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";

export type BroadcastScene = (typeof BROADCAST_SCENES)[number];

export type BroadcastTransition = (typeof BROADCAST_TRANSITIONS)[number];

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
export interface BroadcastGameInk extends BroadcastInk {
	matchId: number;
	resultCount: number;
}

export type BroadcastView = (typeof BROADCAST_VIEWS)[number];

export type BroadcastStreamRole = (typeof BROADCAST_STREAM_ROLES)[number];

/** What the producer controls, staged in `next` and put on air as `live` by a Take. */
export interface ProducerState {
	scene: BroadcastScene;
	/** Shows the featured match's second team on the left. */
	swapSides: boolean;
	/** How a Take puts this state on air, kept on `live` so the overlay knows how the last Take played. */
	transition: BroadcastTransition;
	/** Double elimination bracket of the bracket scene, `null` follows the featured match's. */
	bracketIdx: number | null;
	bracketFocus: BroadcastBracketFocus;
}

export interface BroadcastStoredState {
	/** Incremented by every Take, a Take based on an older one is rejected. */
	takeId: number;
	live: ProducerState;
	next: ProducerState;
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
	health: BroadcastHealth;
}

export type BroadcastStreamMessage =
	| { kind: "state"; state: BroadcastState }
	| { kind: "heartbeat" };

export interface BroadcastHealth {
	/** OBS browser sources showing the overlay. */
	sources: number;
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
}

/** A double elimination bracket (one group of it) laid out as the producer's focus shows it. */
export interface BroadcastBracket {
	idx: number;
	name: string;
	/** Winners (ending with the grand finals) first, then losers. Only the sides in focus. */
	sides: BroadcastBracketSide[];
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

export type BroadcastBracketTeam = Pick<
	BroadcastTeam,
	"id" | "name" | "logoUrl" | "seed"
>;
