/**
 * Play order of a tournament's matches: the order they are meant to be played in when the venue's setups
 * can't fit every playable match at once. A match's play-order depth is the longest chain of matches feeding
 * into it (Winners Round 1 = 0, Winners Round 2 & Losers Round 1 = 1…; round robin and swiss: the round), and
 * a bracket the progression leads to continues after the deepest match of the brackets feeding it. Matches of
 * the same depth go winners before losers, then by match number.
 */
import * as R from "remeda";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { RoundSection } from "~/features/tournament-bracket/core/engine/types";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

const SECTION_RANK: Record<RoundSection, number> = {
	winners: 0,
	losers: 1,
	finals: 2,
};

/** Where a match stands in the play order. */
export interface PlayOrderPosition {
	/** Longest chain of matches before it, the depth of its feeding brackets included. */
	depth: number;
	/** Its place in the play order of every match of the tournament's started brackets, 0 first. */
	rank: number;
}

/** Play order of every match of the tournament's started brackets, keyed by match id. */
export function byMatchId(
	tournament: Tournament,
): Map<number, PlayOrderPosition> {
	const localDepthsByBracketIdx = new Map<number, Map<number, number>>();
	const localDepthsOf = (bracketIdx: number) => {
		const cached = localDepthsByBracketIdx.get(bracketIdx);
		if (cached) return cached;

		const bracket = tournament.bracketByIdx(bracketIdx);
		const depths =
			bracket && !bracket.preview
				? localDepths(bracket.data)
				: new Map<number, number>();
		localDepthsByBracketIdx.set(bracketIdx, depths);

		return depths;
	};

	const offsetsByBracketIdx = new Map<number, number>();
	const offsetOf = (bracketIdx: number): number => {
		const cached = offsetsByBracketIdx.get(bracketIdx);
		if (cached !== undefined) return cached;

		const sources = tournament.bracketByIdx(bracketIdx)?.sources ?? [];
		const offset = Math.max(
			0,
			...sources.map(
				(source) =>
					offsetOf(source.bracketIdx) +
					Math.max(-1, ...localDepthsOf(source.bracketIdx).values()) +
					1,
			),
		);
		offsetsByBracketIdx.set(bracketIdx, offset);

		return offset;
	};

	const entries: Array<{
		matchId: number;
		depth: number;
		sectionRank: number;
		matchNumber: number;
		groupNumber: number;
		bracketIdx: number;
	}> = [];
	for (const bracket of tournament.brackets) {
		if (bracket.preview) continue;

		const depths = localDepthsOf(bracket.idx);
		const offset = offsetOf(bracket.idx);
		const roundsById = new Map(
			bracket.data.round.map((round) => [round.id, round]),
		);
		const groupNumbersById = new Map(
			bracket.data.group.map((group) => [group.id, group.number]),
		);

		for (const match of bracket.data.match) {
			const section = roundsById.get(match.roundId)?.section ?? null;

			entries.push({
				matchId: match.id,
				depth: offset + (depths.get(match.id) ?? 0),
				sectionRank: section ? SECTION_RANK[section] : 0,
				matchNumber: match.number,
				groupNumber: groupNumbersById.get(match.groupId) ?? 0,
				bracketIdx: bracket.idx,
			});
		}
	}

	return new Map(
		R.sortBy(
			entries,
			(entry) => entry.depth,
			(entry) => entry.sectionRank,
			(entry) => entry.matchNumber,
			(entry) => entry.groupNumber,
			(entry) => entry.bracketIdx,
		).map((entry, rank) => [entry.matchId, { depth: entry.depth, rank }]),
	);
}

function localDepths(data: Engine.BracketData) {
	const roundsById = new Map(data.round.map((round) => [round.id, round]));
	const stagesById = new Map(data.stage.map((stage) => [stage.id, stage]));

	const feederIdsByMatchId = new Map<number, number[]>();
	for (const [matchId, nextMatchIds] of Engine.nextMatchIdsByMatchId(data)) {
		for (const nextMatchId of nextMatchIds) {
			feederIdsByMatchId.set(nextMatchId, [
				...(feederIdsByMatchId.get(nextMatchId) ?? []),
				matchId,
			]);
		}
	}

	const result = new Map<number, number>();
	const depthOf = (matchId: number): number => {
		const cached = result.get(matchId);
		if (cached !== undefined) return cached;

		const feederIds = feederIdsByMatchId.get(matchId) ?? [];
		const depth =
			feederIds.length === 0 ? 0 : Math.max(...feederIds.map(depthOf)) + 1;
		result.set(matchId, depth);

		return depth;
	};

	for (const match of data.match) {
		const stageType = stagesById.get(match.stageId)?.type;
		const isRoundBased = stageType === "round_robin" || stageType === "swiss";

		if (isRoundBased) {
			result.set(match.id, (roundsById.get(match.roundId)?.number ?? 1) - 1);
		} else {
			depthOf(match.id);
		}
	}

	return result;
}
