// separate from brackets-manager as this wasn't part of the original brackets-manager library

import blossom from "edmonds-blossom-fixed";
import * as R from "remeda";
import type { TournamentRepositoryInsertableMatch } from "~/features/tournament/TournamentRepository.server";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { InputStage, Match } from "~/modules/brackets-model";
import { nullFilledArray } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import type { Bracket } from "./Bracket";

/**
 * Creates a Swiss tournament data set (initial matches) based on the provided arguments. Mimics bracket-manager module's interfaces.
 */
export function create(
	args: Omit<InputStage, "type" | "number" | "seeding"> & { seeding: number[] },
): TournamentManagerDataSet {
	const swissSettings = args.settings?.swiss;

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
		match: firstRoundMatches({ seeding: args.seeding, groupCount, roundCount }),
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
				name: args.name,
				number: 1,
				settings: args.settings ?? {},
				tournament_id: args.tournamentId,
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
	seeding: InputStage["seeding"];
	groupCount: number;
	roundCount: number;
}): Match[] {
	// split the teams to one or more groups. For example with 16 teams and 3 groups this would result in
	// group 1: 1, 4, 7, 10, 13, 16
	// group 2: 2, 5, 8, 11, 14
	// group 3: 3, 6, 9, 12, 15
	const groups = splitToGroups();

	const result: Match[] = [];

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
				status: 2,
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
				status: 2,
			});
		}
	}

	return result;

	function splitToGroups() {
		if (!seeding) return [];
		if (groupCount === 1) return [[...seeding]];

		const groups: number[][] = nullFilledArray(groupCount).map(() => []);

		for (let i = 0; i < seeding.length; i++) {
			const groupIndex = i % groupCount;
			groups[groupIndex].push(seeding[i]!);
		}

		return groups;
	}
}

function everyMatchOver(matches: Match[]) {
	for (const match of matches) {
		// bye
		if (!match.opponent1 || !match.opponent2) continue;

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return false;
		}
	}

	return true;
}

/**
 * Generates the next round of matchups for a Swiss tournament bracket within a specific group.
 *
 * Considers only the matches and teams within the specified group. Teams that have dropped out are excluded from the pairing process.
 * If the group has an uneven number of teams, the lowest standing team that has not already received a bye is preferred to receive one.
 * Matches are generated such that teams do not replay previous opponents if possible.
 */
export function generateMatchUps({
	bracket,
	groupId,
}: {
	bracket: Bracket;
	groupId: number;
}): Array<TournamentRepositoryInsertableMatch> {
	// lets consider only this groups matches
	// in the case that there are more than one group
	const groupsMatches = bracket.data.match.filter(
		(m) => m.group_id === groupId,
	);

	invariant(groupsMatches.length > 0, "No matches found for group");

	// new matches can't be generated till old are over
	if (!everyMatchOver(groupsMatches)) {
		throw new Error("Not all matches are over");
	}

	const groupsTeams = groupsMatches
		.flatMap((match) => [match.opponent1, match.opponent2])
		.filter(Boolean);
	const groupsStandings = bracket.standings.filter((standing) => {
		return groupsTeams.some((team) => team?.id === standing.team.id);
	});

	// teams who have dropped out are not considered
	const standingsWithoutDropouts = groupsStandings.filter(
		(s) => !s.team.droppedOut,
	);

	const teamsThatHaveHadByes = groupsMatches
		.filter((m) => m.opponent2 === null)
		.map((m) => m.opponent1?.id);

	const pairs = pairUp(
		standingsWithoutDropouts.map((standing) => ({
			id: standing.team.id,
			score: standing.stats?.setWins ?? 0,
			receivedBye: teamsThatHaveHadByes.includes(standing.team.id),
			avoid: groupsMatches.flatMap((match) => {
				if (match.opponent1?.id === standing.team.id) {
					return match.opponent2?.id ? [match.opponent2.id] : [];
				}
				if (match.opponent2?.id === standing.team.id) {
					return match.opponent1?.id ? [match.opponent1.id] : [];
				}
				return [];
			}),
		})),
	);

	let matchNumber = 1;
	const newRoundId = bracket.data.round
		.slice()
		.sort((a, b) => a.id - b.id)
		.filter((r) => r.group_id === groupId)
		.find(
			(r) => r.id > Math.max(...groupsMatches.map((match) => match.round_id)),
		)?.id;
	invariant(newRoundId, "newRoundId not found");
	const result: TournamentRepositoryInsertableMatch[] = pairs.map(
		({ opponentOne, opponentTwo }) => ({
			groupId,
			number: matchNumber++,
			roundId: newRoundId,
			stageId: groupsMatches[0].stage_id,
			opponentOne: JSON.stringify({
				id: opponentOne,
			}),
			opponentTwo:
				typeof opponentTwo === "number"
					? JSON.stringify({
							id: opponentTwo,
						})
					: JSON.stringify(null),
		}),
	);

	return result;
}

interface SwissPairingTeam {
	id: number;
	/** How many matches has the team won */
	score: number;
	/** List of tournament team ids this team already played */
	avoid: Array<number>;
	receivedBye?: boolean;
}

// adapted from https://github.com/slashinfty/tournament-pairings
function pairUp(players: SwissPairingTeam[]) {
	const matches = [];
	const playerArray = R.shuffle(players).map((p, i) => ({ ...p, index: i }));
	const scoreGroups = [...new Set(playerArray.map((p) => p.score))].sort(
		(a, b) => a - b,
	);
	const scoreSums = [
		...new Set(
			scoreGroups.flatMap((s, i, a) => {
				const sums = [];
				for (let j = i; j < a.length; j++) {
					sums.push(s + a[j]);
				}
				return sums;
			}),
		),
	].sort((a, b) => a - b);
	const pairs = [];
	for (let i = 0; i < playerArray.length; i++) {
		const curr = playerArray[i];
		const next = playerArray.slice(i + 1);
		for (let j = 0; j < next.length; j++) {
			const opp = next[j];
			if (Object.hasOwn(curr, "avoid") && curr.avoid.includes(opp.id)) {
				continue;
			}
			let wt =
				75 -
				75 /
					(scoreGroups.findIndex((s) => s === Math.min(curr.score, opp.score)) +
						2);
			wt +=
				5 - 5 / (scoreSums.findIndex((s) => s === curr.score + opp.score) + 1);
			let scoreGroupDiff = Math.abs(
				scoreGroups.findIndex((s) => s === curr.score) -
					scoreGroups.findIndex((s) => s === opp.score),
			);
			scoreGroupDiff += 0.2;
			wt += 23 / (2 * (scoreGroupDiff + 2));
			if (
				(Object.hasOwn(curr, "receivedBye") && curr.receivedBye) ||
				(Object.hasOwn(opp, "receivedBye") && opp.receivedBye)
			) {
				wt += 40;
			}
			pairs.push([curr.index, opp.index, wt]);
		}
	}
	const blossomPairs = blossom(pairs, true);
	const playerCopy = [...playerArray];
	let byeArray = [];
	do {
		const indexA = playerCopy[0].index;
		const indexB = blossomPairs[indexA];
		if (indexB === -1) {
			byeArray.push(playerCopy.splice(0, 1)[0]);
			continue;
		}
		playerCopy.splice(0, 1);
		playerCopy.splice(
			playerCopy.findIndex((p) => p.index === indexB),
			1,
		);
		const playerA = playerArray.find((p) => p.index === indexA);
		const playerB = playerArray.find((p) => p.index === indexB);
		invariant(playerA, "Player A not found");
		invariant(playerB, "Player B not found");

		matches.push({
			opponentOne: playerA.id,
			opponentTwo: playerB.id,
		});
	} while (
		playerCopy.length >
		blossomPairs.reduce(
			(sum: number, idx: number) => (idx === -1 ? sum + 1 : sum),
			0,
		)
	);
	byeArray = [...byeArray, ...playerCopy];
	for (let i = 0; i < byeArray.length; i++) {
		matches.push({
			opponentOne: byeArray[i].id,
			opponentTwo: null,
		});
	}

	return matches;
}
