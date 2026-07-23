import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { nullFilledArray } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type {
	BracketData,
	MatchData,
	ResolvedCreateBracketInput,
} from "../types";
import { MatchStatus } from "../types";

/**
 * Creates a Swiss bracket data set: all rounds up front, matches for round 1 only.
 * Ported from the old core/Swiss.ts create()/firstRoundMatches().
 */
export function createSwiss(input: ResolvedCreateBracketInput): BracketData {
	const swissSettings = input.settings?.swiss;

	const groupCount =
		swissSettings?.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT;
	const roundCount =
		swissSettings?.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT;

	const group = nullFilledArray(groupCount).map((_, i) => ({
		id: i,
		stage_id: 0,
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
				group_id: g.id,
				number: i + 1,
				stage_id: 0,
			})),
		),
		stage: [
			{
				id: 0,
				name: input.name,
				number: 1,
				settings: input.settings ?? {},
				tournament_id: input.tournamentId,
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
	// split the teams to one or more groups. For example with 16 teams and 3 groups this would result in
	// group 1: 1, 4, 7, 10, 13, 16
	// group 2: 2, 5, 8, 11, 14
	// group 3: 3, 6, 9, 12, 15
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

		// first round every team plays the matching team "on the opposite side"
		// so for example with 8 teams match ups look like this:
		// seed 1 vs. seed 5
		// seed 2 vs. seed 6
		// seed 3 vs. seed 7
		// seed 4 vs. seed 8
		// ---
		// this way each match has "equal distance"
		const roundId = groupIdx * roundCount;
		for (let i = 0; i < upperHalf.length; i++) {
			const upper = upperHalf[i];
			const lower = lowerHalf[i];

			result.push({
				id: matchId++,
				group_id: groupIdx,
				stage_id: 0,
				round_id: roundId,
				number: i + 1,
				opponent1: {
					id: upper,
				},
				opponent2: {
					id: lower,
				},
				status: MatchStatus.Ready,
			});
		}

		if (bye) {
			result.push({
				id: matchId++,
				group_id: groupIdx,
				stage_id: 0,
				round_id: roundId,
				number: upperHalf.length + 1,
				opponent1: {
					id: bye,
				},
				opponent2: null,
				status: MatchStatus.Ready,
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
