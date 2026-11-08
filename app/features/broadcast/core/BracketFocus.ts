import type { Tables } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as EliminationLayout from "~/features/tournament-bracket/core/EliminationLayout";
import type {
	BracketData,
	MatchData,
	ParticipantResult,
} from "~/features/tournament-bracket/core/engine/types";
import { getRounds } from "~/features/tournament-bracket/core/rounds";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type {
	BroadcastBracketFocus,
	BroadcastBracketMatch,
	BroadcastBracketRound,
	BroadcastBracketSide,
	BroadcastBracketTeam,
	BroadcastEliminationBracket,
	MatchProgress,
} from "../broadcast-types";

const SHOWABLE_BRACKET_TYPES: Array<Tables["TournamentStage"]["type"]> = [
	"single_elimination",
	"double_elimination",
	"round_robin",
	"swiss",
];

/** The featured match as far as a view shows it. */
export interface FeaturedMatch {
	id: number;
	progress: Pick<MatchProgress, "resultCount" | "scores" | "isOver">;
}

const SIDES_IN_FOCUS: Record<
	BroadcastBracketFocus,
	Array<BroadcastBracketSide["type"]>
> = {
	remaining: ["winners", "losers"],
	winners: ["winners"],
	losers: ["losers"],
	whole: ["winners", "losers"],
};

/**
 * Lays out an elimination bracket for the bracket scene: of double elimination the sides in focus, compactified to
 * the rounds still being played unless the whole bracket is in focus. The featured match is shown as far as the view
 * shows it, so a result not on air yet doesn't spoil it, neither does its winner advancing in the bracket.
 */
export function layout({
	idx,
	name,
	type,
	data,
	groupId,
	focus,
	featured,
	teamById,
}: {
	idx: number;
	name: string;
	type: "single_elimination" | "double_elimination";
	data: BracketData;
	/** Group shown of a bracket split into groups. */
	groupId: number | undefined;
	focus: BroadcastBracketFocus;
	featured: FeaturedMatch | null;
	teamById: (id: number) => BroadcastBracketTeam | null;
}): BroadcastEliminationBracket {
	const bracketData = asOnAir(data, featured);

	const sideTypes =
		type === "single_elimination"
			? (["winners"] as const)
			: SIDES_IN_FOCUS[focus];
	const sides = sideTypes.flatMap((sideType) => {
		const rounds = sideRounds({
			type: type === "single_elimination" ? "single" : sideType,
			bracketData,
			groupId,
			isCompactified: focus !== "whole",
		}).map((round, roundIdx, visibleRounds) =>
			toBroadcastRound({
				round,
				nextRound: visibleRounds[roundIdx + 1],
				previousRound: visibleRounds[roundIdx - 1],
				featuredMatchId: featured?.id ?? null,
				teamById,
			}),
		);
		if (rounds.length === 0) return [];

		const side: BroadcastBracketSide = {
			type: sideType,
			slotCount: Math.max(...rounds.map((round) => round.matches.length)),
			rounds,
		};

		return [side];
	});

	return { type: "elimination", idx, name, sides };
}

/**
 * Index of the bracket the bracket scene shows: the producer's pick, the featured match's bracket or else the
 * last one, of the brackets it can show. `null` when there is none.
 */
export function resolveBracketIdx({
	pickedIdx,
	featuredMatchBracketIdx,
	showableIdxs,
}: {
	pickedIdx: number | null;
	featuredMatchBracketIdx: number | null;
	/** See {@link showableBracketIdxs}. */
	showableIdxs: number[];
}) {
	for (const idx of [pickedIdx, featuredMatchBracketIdx]) {
		if (idx !== null && showableIdxs.includes(idx)) return idx;
	}

	return showableIdxs.at(-1) ?? null;
}

/** Brackets the bracket scene can show: the elimination, round robin and Swiss ones that have started. */
export function showableBracketIdxs(
	tournament: Pick<Tournament, "bracketsMeta">,
) {
	return tournament.bracketsMeta
		.filter(
			(bracket) =>
				SHOWABLE_BRACKET_TYPES.includes(bracket.type) && !bracket.preview,
		)
		.map((bracket) => bracket.idx);
}

interface SideRound {
	id: number;
	name: string;
	matches: MatchData[];
}

function sideRounds({
	type,
	bracketData,
	groupId,
	isCompactified,
}: {
	type: BroadcastBracketSide["type"] | "single";
	bracketData: BracketData;
	groupId: number | undefined;
	isCompactified: boolean;
}): SideRound[] {
	const rounds = getRounds({ type, bracketData, groupId });
	const { hiddenRoundIds, compactedFirstRoundId } = EliminationLayout.resolve({
		rounds,
		bracketData,
		isCompactified,
	});

	return rounds
		.filter((round) => !hiddenRoundIds.has(round.id))
		.map((round) => ({
			id: round.id,
			name: round.name,
			matches: EliminationLayout.matchesOfRound({
				roundId: round.id,
				bracketData,
				compactedFirstRoundId,
			}),
		}));
}

function toBroadcastRound({
	round,
	nextRound,
	previousRound,
	featuredMatchId,
	teamById,
}: {
	round: SideRound;
	nextRound: SideRound | undefined;
	previousRound: SideRound | undefined;
	featuredMatchId: number | null;
	teamById: (id: number) => BroadcastBracketTeam | null;
}): BroadcastBracketRound {
	const feedersOf = (matchIdx: number) => {
		if (!previousRound || isThirdPlaceMatch(round)) return [];
		if (previousRound.matches.length === round.matches.length) {
			return [previousRound.matches[matchIdx]];
		}

		return previousRound.matches.slice(matchIdx * 2, matchIdx * 2 + 2);
	};

	return {
		id: round.id,
		name: round.name,
		connector:
			!nextRound || isThirdPlaceMatch(nextRound)
				? null
				: nextRound.matches.length === round.matches.length
					? "straight"
					: "pairs",
		matches: round.matches.map((match, matchIdx) =>
			isBye(match)
				? null
				: toBroadcastMatch({
						match,
						isFeatured: match.id === featuredMatchId,
						isFed: feedersOf(matchIdx).some(
							(feeder) => feeder && !isBye(feeder),
						),
						teamById,
					}),
		),
	};
}

/** The match as the bracket scene shows it, see {@link asOnAir} for the featured match's. */
export function toBroadcastMatch({
	match,
	isFeatured,
	isFed,
	teamById,
}: {
	match: MatchData;
	isFeatured: boolean;
	isFed: boolean;
	teamById: (id: number) => BroadcastBracketTeam | null;
}): BroadcastBracketMatch {
	const team = (opponent: ParticipantResult | null) =>
		typeof opponent?.id === "number" ? teamById(opponent.id) : null;
	const hasScores =
		typeof match.opponent1?.score === "number" ||
		typeof match.opponent2?.score === "number";

	return {
		id: match.id,
		teams: [team(match.opponent1), team(match.opponent2)],
		scores: hasScores
			? [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0]
			: null,
		winner:
			match.winnerSide === "opponent1"
				? 0
				: match.winnerSide === "opponent2"
					? 1
					: null,
		isFeatured,
		isFed,
	};
}

/**
 * The bracket with the featured match at the view's progress. While the view has its set going, its teams are
 * taken out of the elimination matches they advanced to.
 */
export function asOnAir(
	data: BracketData,
	featured: FeaturedMatch | null,
): BracketData {
	const featuredMatch = data.match.find((match) => match.id === featured?.id);
	if (!featured || !featuredMatch) return data;

	const { progress } = featured;
	const hasStarted = progress.resultCount > 0 || progress.isOver;
	const isResultHidden = Boolean(featuredMatch.winnerSide) && !progress.isOver;
	const featuredStageType = data.stage.find(
		(stage) => stage.id === featuredMatch.stageId,
	)?.type;
	const hasAdvancedTeams =
		isResultHidden &&
		(featuredStageType === "single_elimination" ||
			featuredStageType === "double_elimination");
	const featuredTeamIds = [
		featuredMatch.opponent1?.id,
		featuredMatch.opponent2?.id,
	].filter((id) => typeof id === "number");

	const withScore = (
		opponent: ParticipantResult | null,
		score: number,
	): ParticipantResult | null => {
		if (!opponent) return null;
		const { score: _score, ...rest } = opponent;

		return hasStarted ? { ...rest, score } : rest;
	};
	const withoutAdvancedTeam = (
		opponent: ParticipantResult | null,
	): ParticipantResult | null =>
		typeof opponent?.id === "number" && featuredTeamIds.includes(opponent.id)
			? { id: null }
			: opponent;

	return {
		...data,
		match: data.match.map((match) => {
			if (match.id === featuredMatch.id) {
				return {
					...match,
					opponent1: withScore(match.opponent1, progress.scores[0]),
					opponent2: withScore(match.opponent2, progress.scores[1]),
					winnerSide: progress.isOver ? match.winnerSide : null,
				};
			}
			if (!hasAdvancedTeams || match.winnerSide) return match;

			return {
				...match,
				opponent1: withoutAdvancedTeam(match.opponent1),
				opponent2: withoutAdvancedTeam(match.opponent2),
			};
		}),
	};
}

function isThirdPlaceMatch(round: SideRound) {
	return round.name === TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH;
}

function isBye(match: MatchData) {
	return !match.opponent1 || !match.opponent2;
}
