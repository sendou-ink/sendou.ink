import type { Pronouns } from "~/db/tables-json";
import type {
	BroadcastInk,
	BroadcastMap,
	BroadcastObjectiveRead,
	BroadcastSettings,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
	ProducerState,
} from "~/features/broadcast/broadcast-types";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import type {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_SCENES,
} from "./broadcast-cast-constants";

export type CastScene = (typeof BROADCAST_SCENES)[number];

export type BroadcastBracketFocus = (typeof BROADCAST_BRACKET_FOCUSES)[number];

type BroadcastTeamPick = "left" | "right" | number;

/** What the producer controls of one cast scene, see `ProducerState`. */
export interface CastProducerState extends ProducerState<CastScene> {
	/** Double elimination bracket of the bracket scene, `null` follows the featured match's. */
	bracketIdx: number | null;
	bracketFocus: BroadcastBracketFocus;
	/** Clip the replays scene plays, `null` leaves the footage under it to OBS. */
	clipId: string | null;
	/** Team of the team scene: one of the featured match's by its side (following the match cast), or any by its id. */
	teamPick: BroadcastTeamPick;
}

export interface CastBroadcastSettings extends BroadcastSettings {
	/** Message of the full screen scenes, e.g. "Top 8 starts at 18:00 CEST". */
	headline: string;
	/** Users under the camera frames of the casters scene, one frame per caster. */
	casterIds: number[];
}

/** Full snapshot pushed to every client of a cast broadcast's stream. */
export interface CastBroadcastState
	extends BroadcastState<CastProducerState, CastBroadcastSettings> {
	/** Users of `settings.casterIds` in order, ones that no longer exist left out. */
	casters: BroadcastCaster[];
	/** What the bracket scene shows in each view, `null` without a double elimination bracket to show. */
	bracket: Record<BroadcastView, BroadcastBracket | null>;
	/** What the team scene shows in each view, `null` when the view is on another scene or the team is not found. */
	team: Record<BroadcastView, BroadcastTeamSpotlight | null>;
	/** The tournament's other matches being played, what the "elsewhere" ticker shows. */
	otherMatches: BroadcastOtherMatch[];
}

/** A game of the featured match, what the results scene shows: as the scanner read it, or as reported without one. */
export interface BroadcastGameResult {
	/** The set's game it was, 1 for the first. `null` when not known. */
	gameNumber: number | null;
	/** Ink colors the game was played in, `null` when none were picked for it. */
	ink: BroadcastInk | null;
	/** `null` when neither read nor picked. */
	map: BroadcastMap | null;
	/** Index of the winning team in bracket order, `null` when not known. */
	winner: 0 | 1 | null;
	isKnockout: boolean;
	/** In bracket order. */
	teams: [BroadcastGameResultTeam, BroadcastGameResultTeam];
	/** Objective counter reads over the game, scores in bracket order. Empty when none were read. */
	objective: BroadcastObjectiveRead[];
}

export interface BroadcastGameResultTeam {
	/** 0-100, how much of the counter the team took. `null` when not read. */
	score: number | null;
	players: BroadcastGameResultPlayer[];
}

export interface BroadcastGameResultPlayer {
	/** In-game name, `null` when neither read nor known from the roster. */
	name: string | null;
	weaponSplId: MainWeaponId | null;
	/** Main abilities of the head, clothes and shoes, empty when not read. */
	abilities: AbilityWithUnknown[];
}

export interface BroadcastCaster {
	userId: number;
	name: string;
	pronouns: Pronouns | null;
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
