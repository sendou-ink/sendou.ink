import blossom from "edmonds-blossom-fixed";
import { err, ok, type Result } from "neverthrow";
import * as R from "remeda";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import invariant from "~/utils/invariant";
import type {
	BracketData,
	GeneratedRound,
	MatchData,
	SwissStanding,
} from "../types";
import { calculateTeamStatus } from "./team-status";

/**
 * Generates the next round of matchups for a Swiss tournament bracket within a specific group.
 *
 * Considers only the matches and teams within the specified group. Teams that have dropped out are excluded from the pairing process.
 * If the group has an uneven number of teams, the lowest standing team that has not already received a bye is preferred to receive one.
 * Matches are generated such that teams do not replay previous opponents if possible.
 */
export function generateRound(
	data: BracketData,
	args: {
		groupId: number;
		standings: SwissStanding[];
		settings: { advanceThreshold?: number; roundCount?: number } | null;
	},
): Result<GeneratedRound, string> {
	// lets consider only this groups matches
	// in the case that there are more than one group
	const groupsMatches = data.match.filter((m) => m.group_id === args.groupId);

	if (groupsMatches.length === 0) return err("No matches found for group");
	if (data.stage[0]?.type !== "swiss") return err("Bracket is not Swiss type");

	// new matches can't be generated till old are over
	if (!everyMatchOver(groupsMatches)) {
		return err("Not all matches are over");
	}

	const groupsTeams = groupsMatches
		.flatMap((match) => [match.opponent1, match.opponent2])
		.filter(Boolean);
	const groupsStandings = args.standings.filter((standing) => {
		return groupsTeams.some((team) => team?.id === standing.team.id);
	});

	// teams who have dropped out are not considered
	let standingsWithoutDropouts = groupsStandings.filter(
		(s) => !s.team.droppedOut,
	);

	// filter out teams that have advanced or been eliminated if early advance/elimination is enabled
	if (typeof args.settings?.advanceThreshold === "number") {
		const roundCount =
			args.settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT;
		const advanceThreshold = args.settings.advanceThreshold;

		standingsWithoutDropouts = standingsWithoutDropouts.filter((standing) => {
			const wins = standing.stats?.setWins ?? 0;
			const losses = standing.stats?.setLosses ?? 0;
			const status = calculateTeamStatus({
				wins,
				losses,
				advanceThreshold,
				roundCount,
			});

			return status === "active";
		});
	}

	// if there are fewer than 2 active teams, no more matches can be generated
	if (standingsWithoutDropouts.length < 2) {
		return err("Not enough active teams to generate matches");
	}

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
	const newRoundId = data.round
		.slice()
		.sort((a, b) => a.id - b.id)
		.filter((r) => r.group_id === args.groupId)
		.find(
			(r) => r.id > Math.max(...groupsMatches.map((match) => match.round_id)),
		)?.id;
	invariant(newRoundId, "newRoundId not found");

	return ok({
		groupId: args.groupId,
		roundId: newRoundId,
		matches: pairs.map(({ opponentOne, opponentTwo }) => ({
			number: matchNumber++,
			opponent1: { id: opponentOne },
			opponent2: typeof opponentTwo === "number" ? { id: opponentTwo } : null,
		})),
	});
}

function everyMatchOver(matches: MatchData[]) {
	for (const match of matches) {
		// bye
		if (!match.opponent1 || !match.opponent2) continue;

		if (match.opponent1.result !== "win" && match.opponent2.result !== "win") {
			return false;
		}
	}

	return true;
}

interface SwissPairingTeam {
	id: number;
	/** How many matches has the team won */
	score: number;
	/** List of tournament team ids this team already played */
	avoid: Array<number>;
	receivedBye?: boolean;
}

/**
 * Pairs up teams for a swiss round using maximum weighted matching, avoiding
 * rematches if possible and preferring teams with equal scores to play each other.
 *
 * Adapted from https://github.com/slashinfty/tournament-pairings
 */
export function pairUp(players: SwissPairingTeam[]) {
	if (players.length < 2) {
		throw new Error("Need at least two players to pair up");
	}
	if (players.length === 2) {
		return [{ opponentOne: players[0].id, opponentTwo: players[1].id }];
	}

	// uncomment to add a new test case to PAIR_UP_TEST_CASES
	// console.log(players);

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

	let pairs = generateWeightedPairs({ playerArray, scoreGroups, scoreSums });
	if (pairs.length === 0) {
		// no possible pairs without rematches, try again allowing rematches
		pairs = generateWeightedPairs({
			playerArray,
			scoreGroups,
			scoreSums,
			considerAvoid: false,
		});
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

function generateWeightedPairs({
	playerArray,
	scoreGroups,
	scoreSums,
	considerAvoid = true,
}: {
	playerArray: (SwissPairingTeam & { index: number })[];
	scoreGroups: number[];
	scoreSums: number[];
	considerAvoid?: boolean;
}) {
	const pairs: [number, number, number][] = [];
	for (let i = 0; i < playerArray.length; i++) {
		const curr = playerArray[i];
		const next = playerArray.slice(i + 1);
		for (let j = 0; j < next.length; j++) {
			const opp = next[j];
			if (
				considerAvoid &&
				Object.hasOwn(curr, "avoid") &&
				curr.avoid.includes(opp.id)
			) {
				continue;
			}
			let wt =
				75 - 75 / (scoreGroups.indexOf(Math.min(curr.score, opp.score)) + 2);
			wt +=
				5 - 5 / (scoreSums.findIndex((s) => s === curr.score + opp.score) + 1);
			const scoreGroupDiff = Math.abs(
				scoreGroups.indexOf(curr.score) - scoreGroups.indexOf(opp.score),
			);

			// TODO: consider "pairedUpDown"
			// if (
			// 	scoreGroupDiff === 1 &&
			// 	curr.hasOwnProperty("pairedUpDown") &&
			// 	curr.pairedUpDown === false &&
			// 	opp.hasOwnProperty("pairedUpDown") &&
			// 	opp.pairedUpDown === false
			// ) {
			// 	scoreGroupDiff -= 0.65;
			// } else if (
			// 	scoreGroupDiff > 0 &&
			// 	((curr.hasOwnProperty("pairedUpDown") && curr.pairedUpDown === true) ||
			// 		(opp.hasOwnProperty("pairedUpDown") && opp.pairedUpDown === true))
			// ) {
			// 	scoreGroupDiff += 0.2;
			// }

			wt += 23 / (2 * (scoreGroupDiff + 2));

			// Lower weight for larger score differences, we really want to avoid 2-0 playing 0-2 etc.
			if (scoreGroupDiff >= 2) {
				wt -= 10;
			}

			if (
				(Object.hasOwn(curr, "receivedBye") && curr.receivedBye) ||
				(Object.hasOwn(opp, "receivedBye") && opp.receivedBye)
			) {
				wt += 40;
			}
			pairs.push([curr.index, opp.index, wt]);
		}
	}

	return pairs;
}
