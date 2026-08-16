import blossom from "edmonds-blossom-fixed";
import * as R from "remeda";
import invariant from "~/utils/invariant";
import { err, ok, type Result } from "~/utils/result";
import { swissRoundCount } from "../create/settings";
import type {
	BracketData,
	GeneratedRound,
	MatchData,
	SwissStanding,
} from "../types";
import { calculateTeamStatus } from "./team-status";

/**
 * Weight subtracted for each time a pair has already played each other. Big enough
 * to dwarf every other weight of the whole round, meaning rematches only happen when
 * unavoidable and then as few of them as possible.
 */
const REMATCH_PENALTY = 1_000_000;

/**
 * Weight added for each team of a pair that has already received a bye, making
 * previously-byed teams more attractive to pair up. Applied per team (not per pair)
 * so that a matching leaving a bye-less team unpaired always beats one giving a team
 * a second bye: with an odd team count exactly one team is left unpaired, so the
 * matchings differ by exactly one bonus, which is set to dwarf every score-based
 * weight while staying far below REMATCH_PENALTY.
 */
const PRIOR_BYE_PAIRING_BONUS = 10_000;

interface GroupArgs {
	groupId: number;
	standings: SwissStanding[];
	settings: { advanceThreshold?: number } | null;
}

/**
 * Generates the next round of matchups for a Swiss tournament bracket within a specific group.
 *
 * Considers only the matches and teams within the specified group. Teams that have dropped out are excluded from the pairing process.
 * If the group has an uneven number of teams, the lowest standing team that has not already received a bye is preferred to receive one.
 * A team that is the only one left in the running receives a bye for the round.
 * Matches are generated such that teams do not replay previous opponents if possible.
 */
export function generateRound(
	data: BracketData,
	args: GroupArgs,
): Result<GeneratedRound, string> {
	// lets consider only this groups matches
	// in the case that there are more than one group
	const groupsMatches = data.match.filter((m) => m.groupId === args.groupId);

	if (groupsMatches.length === 0) return err("No matches found for group");
	if (data.stage[0]?.type !== "swiss") return err("Bracket is not Swiss type");

	// new matches can't be generated till old are over
	if (!everyMatchOver(groupsMatches)) {
		return err("Not all matches are over");
	}

	const activeStandings = activeTeamStandings(data, args);

	if (activeStandings.length === 0) {
		return err("Not enough active teams to generate matches");
	}

	const teamsThatHaveHadByes = groupsMatches
		.filter((m) => m.opponent2 === null)
		.map((m) => m.opponent1?.id);

	const pairs = pairUp(
		activeStandings.map((standing) => ({
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
		.filter((r) => r.groupId === args.groupId)
		.find(
			(r) => r.id > Math.max(...groupsMatches.map((match) => match.roundId)),
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

/**
 * Whether the group still has at least one team that can be paired into a new round.
 *
 * False when every team of the group has dropped out or, with the early advance
 * variation, has already advanced or been eliminated. In that case the remaining
 * rounds of the group can never be started.
 */
export function groupHasActiveTeams(data: BracketData, args: GroupArgs) {
	return activeTeamStandings(data, args).length > 0;
}

function activeTeamStandings(data: BracketData, args: GroupArgs) {
	const groupsMatches = data.match.filter((m) => m.groupId === args.groupId);

	const groupsTeams = groupsMatches
		.flatMap((match) => [match.opponent1, match.opponent2])
		.filter(Boolean);
	const groupsStandings = args.standings.filter((standing) => {
		return groupsTeams.some((team) => team?.id === standing.team.id);
	});

	// teams who have dropped out are not considered
	const standingsWithoutDropouts = groupsStandings.filter(
		(s) => !s.team.droppedOut,
	);

	// filter out teams that have advanced or been eliminated if early advance/elimination is enabled
	if (typeof args.settings?.advanceThreshold !== "number") {
		return standingsWithoutDropouts;
	}

	const roundCount = swissRoundCount(data);
	const advanceThreshold = args.settings.advanceThreshold;

	return standingsWithoutDropouts.filter((standing) => {
		const status = calculateTeamStatus({
			wins: standing.stats?.setWins ?? 0,
			losses: standing.stats?.setLosses ?? 0,
			advanceThreshold,
			roundCount,
		});

		return status === "active";
	});
}

function everyMatchOver(matches: MatchData[]) {
	for (const match of matches) {
		// bye
		if (!match.opponent1 || !match.opponent2) continue;

		if (!match.winnerSide) {
			return false;
		}
	}

	return true;
}

interface SwissPairingTeam {
	id: number;
	/** How many matches has the team won */
	score: number;
	/** List of tournament team ids this team already played, one entry per meeting */
	avoid: Array<number>;
	receivedBye?: boolean;
}

/**
 * Pairs up teams for a swiss round using maximum weighted matching, avoiding
 * rematches if possible and preferring teams with equal scores to play each other.
 * A team left over (odd amount of teams, or only one team given) receives a bye.
 *
 * Adapted from https://github.com/slashinfty/tournament-pairings
 */
export function pairUp(players: SwissPairingTeam[]) {
	if (players.length === 0) {
		throw new Error("Need at least one player to pair up");
	}
	if (players.length === 1) {
		return [{ opponentOne: players[0].id, opponentTwo: null }];
	}
	if (players.length === 2) {
		return [{ opponentOne: players[0].id, opponentTwo: players[1].id }];
	}

	// uncomment to add a new test case to PAIR_UP_TEST_CASES
	// console.log(players);

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

	// every pair is considered so that the matching always covers as many teams as
	// possible, rematches are simply weighted down heavily rather than left out
	const blossomPairs = blossom(
		generateWeightedPairs({ playerArray, scoreGroups, scoreSums }),
		true,
	);

	const matches: Array<{ opponentOne: number; opponentTwo: number | null }> =
		[];
	const byes: number[] = [];
	const pairedIndexes = new Set<number>();

	for (const player of playerArray) {
		if (pairedIndexes.has(player.index)) continue;

		const opponentIndex = blossomPairs[player.index];
		if (opponentIndex === -1) {
			byes.push(player.id);
			continue;
		}

		const opponent = playerArray[opponentIndex];
		invariant(opponent, "Opponent not found");

		pairedIndexes.add(player.index);
		pairedIndexes.add(opponentIndex);

		matches.push({ opponentOne: player.id, opponentTwo: opponent.id });
	}

	for (const id of byes) {
		matches.push({ opponentOne: id, opponentTwo: null });
	}

	return matches;
}

function generateWeightedPairs({
	playerArray,
	scoreGroups,
	scoreSums,
}: {
	playerArray: (SwissPairingTeam & { index: number })[];
	scoreGroups: number[];
	scoreSums: number[];
}) {
	const pairs: [number, number, number][] = [];
	for (let i = 0; i < playerArray.length; i++) {
		const curr = playerArray[i];
		const next = playerArray.slice(i + 1);
		for (let j = 0; j < next.length; j++) {
			const opp = next[j];
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

			if (curr.receivedBye) {
				wt += PRIOR_BYE_PAIRING_BONUS;
			}
			if (opp.receivedBye) {
				wt += PRIOR_BYE_PAIRING_BONUS;
			}

			wt -= timesPlayed(curr, opp) * REMATCH_PENALTY;

			pairs.push([curr.index, opp.index, wt]);
		}
	}

	return pairs;
}

function timesPlayed(curr: SwissPairingTeam, opp: SwissPairingTeam) {
	return curr.avoid.filter((id) => id === opp.id).length;
}
