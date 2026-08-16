import type { Tables } from "~/db/tables";
import type {
	TournamentRoundMaps,
	TournamentStageSettings,
} from "~/db/tables-json";

/**
 * The side of an opponent. Upstream brackets-model also allowed a draw —
 * intentionally dropped, draws are impossible in our formats.
 */
export type Side = "opponent1" | "opponent2";

export type StageType = Tables["TournamentStage"]["type"];

/**
 * All the possible types of group in an elimination stage.
 *
 * - `single_bracket` for single elimination.
 * - `winner_bracket` and `loser_bracket` for double elimination.
 * - `final_group` for both single and double elimination.
 */
export type GroupType =
	| "single_bracket"
	| "winner_bracket"
	| "loser_bracket"
	| "final_group";

export type SeedOrdering =
	| "natural"
	| "reverse"
	| "half_shift"
	| "reverse_half_shift"
	| "pair_flip"
	| "space_between"
	| "groups.seed_optimized";

/** The seeding for a stage. Each element is a participant id or a BYE: `null`. */
export type Seeding = (number | null)[];

/**
 * The possible settings for a stage. Same shape as what is persisted in
 * TournamentStage.settings today (the old brackets-model StageSettings).
 */
export interface StageSettings {
	/** Number of groups in a round robin or swiss stage. */
	groupCount?: number;

	/** Number of rounds in a swiss stage. */
	roundCount?: number;

	/**
	 * Whether to generate a bipartite round-robin where teams are split into two
	 * A/B divisions and every match pairs one A team with one B team.
	 */
	hasAbDivisions?: boolean;

	/**
	 * Whether matches in a round-robin stage are playable independently of each other.
	 *
	 * - If `false` (default), only round 1 matches start `Ready`; later rounds start
	 *   `Locked` and unlock as both opponents complete the previous round.
	 * - If `true`, every match with two opponents starts `Ready`.
	 */
	independentRounds?: boolean;

	/** Optional final between semi-final losers. */
	consolationFinal?: boolean;
}

export interface ParticipantResult {
	/** `null` = to be determined (source match unfinished). */
	id: number | null;

	/** Seed position this slot was filled from. */
	position?: number;

	/** The current score of the participant. */
	score?: number;

	/**
	 * KO win count this set, aggregated on hydrate. Upstream's totalPoints is
	 * intentionally gone — scoring is KO-only.
	 */
	totalKos?: number;
}

/* ------------------------------------------------------------------ */
/* Bracket data — identical shape to the old BracketData  */
/* ------------------------------------------------------------------ */

export interface StageData {
	id: number;
	/** Only set on stages read from the database, the engine does not create names. */
	name?: string;
	type: StageType;
	settings: StageSettings;
	number: number;
	createdAt?: number | null;
}

export interface GroupData {
	id: number;
	stageId: number;
	number: number;
}

export interface RoundData {
	id: number;
	stageId: number;
	groupId: number;
	number: number;
	maps?: TournamentRoundMaps | null;
}

export interface MatchResults {
	opponent1: ParticipantResult | null;
	opponent2: ParticipantResult | null;

	/**
	 * The side that won the set, `null` while the match has no winner. A match
	 * won against a BYE gets it set once the BYE is propagated.
	 */
	winnerSide: Side | null;
}

export interface MatchData extends MatchResults {
	id: number;
	stageId: number;
	groupId: number;
	roundId: number;
	number: number;
	startedAt?: number | null;
}

/**
 * The whole state of one tournament's brackets. This is the single value the
 * engine reads and returns. Never mutated in place — every engine operation
 * returns a new BracketData.
 */
export interface BracketData {
	stage: StageData[];
	group: GroupData[];
	round: RoundData[];
	match: MatchData[];
}

/* ------------------------------------------------------------------ */
/* Engine internals                                                    */
/* ------------------------------------------------------------------ */

/** Used by the engine to handle placements. Is `null` if is a BYE. Has a `null` id if it's yet to be determined. */
export type ParticipantSlot = { id: number | null; position?: number } | null;

/** The engine only handles duels. It's one participant versus another participant. */
export type Duel = [ParticipantSlot, ParticipantSlot];

/** Type of an object implementing every ordering method. */
export type OrderingMap = Record<
	SeedOrdering,
	<T>(array: T[], ...args: number[]) => T[]
>;

/** Contains the losers and the winner of a standard bracket. */
export interface StandardBracketResults {
	/** The list of losers for each round of the bracket. */
	losers: ParticipantSlot[][];

	/** The winner of the bracket. */
	winner: ParticipantSlot;
}

/* ------------------------------------------------------------------ */
/* Engine inputs                                                       */
/* ------------------------------------------------------------------ */

export interface CreateBracketInput {
	type: StageType;
	/** Team ids in seed order; `null` = BYE. */
	seeding: Seeding;
	/** User-selected settings; the engine derives its internal stage settings (defaults, group counts, seed ordering) from these. */
	settings: TournamentStageSettings | null;
	/** (Round robin only) Whether matches are playable independently of rounds (league divisions). */
	independentRounds?: boolean;
	/** Parallel to seeding; required when settings.hasAbDivisions. 0 = A, 1 = B. */
	abDivisions?: (0 | 1)[];
	/** Stage number within the tournament. Defaults to 1 (local data; the repository assigns the real number on insert). */
	number?: number;
	/**
	 * Per-round map info to assign onto the created rounds, keyed by the local
	 * round ids of an identically created bracket (the preview the maps were
	 * picked against). For round robin and swiss one entry per distinct round
	 * number — groups share map lists.
	 */
	maps?: RoundMapsInput[];
}

/** One round's map info as picked by the organizer against a bracket preview. */
export type RoundMapsInput = TournamentRoundMaps & {
	roundId: number;
	groupId?: number;
};

/**
 * Engine-internal variant of {@link CreateBracketInput}: settings are the
 * already-resolved internal {@link StageSettings}.
 */
export interface ResolvedCreateBracketInput
	extends Omit<CreateBracketInput, "settings" | "independentRounds"> {
	settings: StageSettings;
}

/**
 * A result to apply to a match. The opponents of a match are decided by the
 * bracket, never by a reported result, so only the scores and the winner can be
 * given.
 */
export interface MatchResultsInput {
	/**
	 * Games won by each side. Leaving it out keeps the current scores, `null`
	 * clears them.
	 */
	scores?: [number, number] | null;
	/**
	 * Ends the set with this side as the winner even when the scores don't
	 * decide it (an organizer force-ending a set, a team dropping out). Leaving
	 * it out resolves the winner from the scores and the round's map count.
	 */
	winnerSide?: Side;
}

/** A {@link MatchResultsInput} targeted at one match of the bracket. */
export interface ReportResultInput extends MatchResultsInput {
	matchId: number;
}

/** The subset of a standing the swiss round generation needs. */
export interface SwissStanding {
	team: {
		id: number;
		/** Truthy when the team has dropped out (DB stores 0/1). */
		droppedOut?: number | boolean;
	};
	stats?: {
		setWins: number;
		setLosses: number;
	};
}

/* ------------------------------------------------------------------ */
/* Engine outputs                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every engine mutation returns the full next state plus the delta. The
 * repository persists ONLY the delta; the state is for the caller to keep
 * working with (chained operations, simulations, revalidation payloads).
 */
export interface EngineResult {
	data: BracketData;
	/** Matches whose row must be UPDATEd (opponents changed). */
	changedMatches: MatchData[];
}

/** Matches to INSERT when a new round is generated (swiss). */
export interface GeneratedRound {
	groupId: number;
	roundId: number;
	matches: Array<{
		number: number;
		opponent1: ParticipantResult | null;
		/** null opponent = BYE */
		opponent2: ParticipantResult | null;
	}>;
}

export interface DroppedTeamsResult extends EngineResult {
	endedMatchIds: number[];
}
