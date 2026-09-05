import type { Tables } from "~/db/tables";
import type {
	TournamentRoundMaps,
	TournamentStageSettings,
} from "~/db/tables-json";

/** No draw side: draws are impossible in our formats. */
export type Side = "opponent1" | "opponent2";

export type StageType = Tables["TournamentStage"]["type"];

/** Group types of an elimination stage; `final_group` exists in both single and double elimination. */
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

/** Same shape as what is persisted in TournamentStage.settings. */
export interface StageSettings {
	/** Number of groups in a round robin or swiss stage. */
	groupCount?: number;

	/** Number of rounds in a swiss stage. */
	roundCount?: number;

	/** Bipartite round-robin: teams split into A/B divisions, every match pairs an A team with a B team. */
	hasAbDivisions?: boolean;

	/**
	 * Round robin: `false` (default) starts only round 1 `Ready`, later rounds unlock as both
	 * opponents complete the previous round; `true` starts every match with two opponents `Ready`.
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

	score?: number;

	/** KO win count this set, aggregated on hydrate. */
	totalKos?: number;
}

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
	/** Datetime the round is played by default (leagues). */
	defaultPlayTime?: number | null;
}

export interface MatchResults {
	opponent1: ParticipantResult | null;
	opponent2: ParticipantResult | null;

	/** `null` while there is no winner. A match won against a BYE gets it set once the BYE is propagated. */
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

/** Whole state of one tournament's brackets. Never mutated in place, every engine operation returns a new one. */
export interface BracketData {
	stage: StageData[];
	group: GroupData[];
	round: RoundData[];
	match: MatchData[];
}

/** `null` if a BYE, `null` id if yet to be determined. */
export type ParticipantSlot = { id: number | null; position?: number } | null;

export type Duel = [ParticipantSlot, ParticipantSlot];

export type OrderingMap = Record<
	SeedOrdering,
	<T>(array: T[], ...args: number[]) => T[]
>;

export interface StandardBracketResults {
	/** Losers of each round. */
	losers: ParticipantSlot[][];
	winner: ParticipantSlot;
}

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
	 * Keyed by the local round ids of an identically created bracket (the preview the maps were
	 * picked against). Round robin and swiss: one entry per round number, groups share map lists.
	 */
	maps?: RoundMapsInput[];
}

/** One round's map info as picked by the organizer against a bracket preview. */
export type RoundMapsInput = TournamentRoundMaps & {
	roundId: number;
	groupId?: number;
};

/** {@link CreateBracketInput} with settings already resolved to internal {@link StageSettings}. */
export interface ResolvedCreateBracketInput
	extends Omit<CreateBracketInput, "settings" | "independentRounds"> {
	settings: StageSettings;
}

/** Opponents are decided by the bracket, never by a reported result, so only scores and winner can be given. */
export interface MatchResultsInput {
	/** Games won by each side. Omitted keeps the current scores, `null` clears them. */
	scores?: [number, number] | null;
	/**
	 * Ends the set with this side as winner even when the scores don't decide it (force-end, drop out).
	 * Omitted resolves the winner from the scores and the round's map count.
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

/** Full next state plus the delta. The repository persists only the delta. */
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
