import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { nullFilledArray } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type {
	BracketData,
	MatchData,
	ResolvedCreateBracketInput,
} from "../types";

/** All rounds up front, matches for round 1 only. */
export function createSwiss(input: ResolvedCreateBracketInput): BracketData {
	const groupCount =
		input.settings.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT;
	const roundCount =
		input.settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT;

	const group = nullFilledArray(groupCount).map((_, i) => ({
		id: i,
		stageId: 0,
		number: i + 1,
	}));

	let roundId = 0;
	return {
		group,
		match: firstRoundMatches({
			seeding: input.seeding,
			groupCount,
			roundCount,
		}),
		round: group.flatMap((g) =>
			nullFilledArray(roundCount).map((_, i) => ({
				id: roundId++,
				groupId: g.id,
				number: i + 1,
				stageId: 0,
			})),
		),
		stage: [
			{
				id: 0,
				number: 1,
				settings: input.settings,
				type: "swiss",
			},
		],
	};
}

function firstRoundMatches({
	seeding,
	groupCount,
	roundCount,
}: {
	seeding: ResolvedCreateBracketInput["seeding"];
	groupCount: number;
	roundCount: number;
}): MatchData[] {
	// e.g. 16 teams and 3 groups: 1, 4, 7, 10, 13, 16 / 2, 5, 8, 11, 14 / 3, 6, 9, 12, 15
	const groups = splitToGroups();

	const result: MatchData[] = [];

	let matchId = 0;
	for (const [groupIdx, participants] of groups.entries()) {
		// if there is an uneven number of teams the last seed gets a bye
		const bye = participants.length % 2 === 0 ? null : participants.pop();

		const halfI = participants.length / 2;
		const upperHalf = participants.slice(0, halfI);
		const lowerHalf = participants.slice(halfI);

		invariant(
			upperHalf.length === lowerHalf.length,
			"firstRoundMatches: halfs not equal",
		);

		// every team plays the matching team "on the opposite side" so each match has "equal distance",
		// e.g. 8 teams: 1 vs. 5, 2 vs. 6, 3 vs. 7, 4 vs. 8
		const roundId = groupIdx * roundCount;
		for (let i = 0; i < upperHalf.length; i++) {
			const upper = upperHalf[i];
			const lower = lowerHalf[i];

			result.push({
				id: matchId++,
				groupId: groupIdx,
				stageId: 0,
				roundId: roundId,
				number: i + 1,
				opponent1: {
					id: upper,
				},
				opponent2: {
					id: lower,
				},
				winnerSide: null,
			});
		}

		if (bye) {
			result.push({
				id: matchId++,
				groupId: groupIdx,
				stageId: 0,
				roundId: roundId,
				number: upperHalf.length + 1,
				opponent1: {
					id: bye,
				},
				opponent2: null,
				winnerSide: null,
			});
		}
	}

	return result;

	function splitToGroups() {
		if (!seeding) return [];
		if (groupCount === 1) return [seeding.map((id) => id!)];

		const groups: number[][] = nullFilledArray(groupCount).map(() => []);

		for (let i = 0; i < seeding.length; i++) {
			const groupIndex = i % groupCount;
			groups[groupIndex].push(seeding[i]!);
		}

		return groups;
	}
}
