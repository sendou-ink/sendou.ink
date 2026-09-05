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

/** Subtracted per prior meeting of a pair. Dwarfs every other weight of the round so rematches happen only when unavoidable, and then as few as possible. */
const REMATCH_PENALTY = 1_000_000_000;

/**
 * Added per team of a pair that already received a bye. Per team, not per pair, so leaving a bye-less
 * team unpaired always beats a second bye: with an odd count exactly one team is unpaired, so matchings
 * differ by one bonus, sized to dwarf every score-based weight while staying far below REMATCH_PENALTY.
 */
const PRIOR_BYE_PAIRING_BONUS = 10_000_000;

/**
 * Added per score point of both teams of a pair, so with an odd count the matching leaves a lowest-score
 * team unpaired for the bye. Without it the bye can drift to a top team when score group parities allow
 * all-within-group pairings only that way. Dwarfs the pairing quality weights (< ~100 per pair) while a
 * full round's worth stays far below PRIOR_BYE_PAIRING_BONUS.
 */
const HIGH_SCORE_PAIRING_BONUS = 10_000;

interface GroupArgs {
	groupId: number;
	standings: SwissStanding[];
	settings: { advanceThreshold?: number } | null;
}

/**
 * Next round of a Swiss group. Dropped out teams are excluded. With an uneven count the lowest standing
 * team without a prior bye gets one; a lone remaining team gets a bye. Rematches are avoided if possible.
 */
export function generateRound(
	data: BracketData,
	args: GroupArgs,
): Result<GeneratedRound, string> {
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

/** False when every team dropped out or (early advance) advanced/got eliminated, so no further round can start. */
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

	const standingsWithoutDropouts = groupsStandings.filter(
		(s) => !s.team.droppedOut,
	);

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
	score: number;
	/** Tournament team ids already played, one entry per meeting */
	avoid: Array<number>;
	receivedBye?: boolean;
}

/**
 * Maximum weighted matching avoiding rematches if possible and preferring equal scores. A team left
 * over gets a bye. Adapted from https://github.com/slashinfty/tournament-pairings
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

	// every pair is considered so the matching covers as many teams as possible, rematches are weighted down instead of left out
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

			// really want to avoid 2-0 playing 0-2 etc.
			if (scoreGroupDiff >= 2) {
				wt -= 10;
			}

			wt += (curr.score + opp.score) * HIGH_SCORE_PAIRING_BONUS;

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
