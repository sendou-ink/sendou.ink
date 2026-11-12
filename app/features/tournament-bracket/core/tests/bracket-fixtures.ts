import * as Engine from "../engine";
import type { BracketData, MatchData, RoundSection } from "../engine/types";

/** Plays every match of the bracket, the lower team id winning unless the other team is favored. */
export function playedOut(
	data: BracketData,
	favoredIds: number[] = [],
): BracketData {
	let result = data;
	let ready = readyMatches(result, () => true);
	while (ready.length) {
		for (const match of ready) {
			result = reportLowerIdWinner(result, match.id, favoredIds);
		}
		ready = readyMatches(result, () => true);
	}

	return result;
}

/** Plays the matches as they become ready while `predicate` accepts them, the lower team id winning unless the other team is favored. */
export function playedWhile(
	data: BracketData,
	predicate: (match: MatchData, data: BracketData) => boolean,
	favoredIds: number[] = [],
): BracketData {
	let result = data;
	let ready = readyMatches(result, (match) => predicate(match, result));
	while (ready.length) {
		for (const match of ready) {
			result = reportLowerIdWinner(result, match.id, favoredIds);
		}
		ready = readyMatches(result, (match) => predicate(match, result));
	}

	return result;
}

/** The lower team id wins, unless only the other team is favored. */
export function reportLowerIdWinner(
	data: BracketData,
	matchId: number,
	favoredIds: number[] = [],
): BracketData {
	const match = matchById(data, matchId);
	const opponent1Id = match.opponent1!.id!;
	const opponent2Id = match.opponent2!.id!;
	const opponent1Favored = favoredIds.includes(opponent1Id);
	const opponent2Favored = favoredIds.includes(opponent2Id);
	const opponent1Wins =
		opponent1Favored === opponent2Favored
			? opponent1Id < opponent2Id
			: opponent1Favored;

	return reportWinner(data, matchId, opponent1Wins ? "opponent1" : "opponent2");
}

/** Reports a 2-0 win for the given side of the match. */
export function reportWinner(
	data: BracketData,
	matchId: number,
	winnerSide: "opponent1" | "opponent2",
): BracketData {
	return Engine.reportResult(data, {
		matchId,
		scores: winnerSide === "opponent1" ? [2, 0] : [0, 2],
		winnerSide,
	}).data;
}

/** Unplayed matches with both teams known. */
export function readyMatches(
	data: BracketData,
	predicate: (match: MatchData) => boolean,
) {
	return data.match.filter(
		(match) =>
			predicate(match) &&
			match.opponent1?.id != null &&
			match.opponent2?.id != null &&
			match.winnerSide == null,
	);
}

export function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}

/** Matches of the round with the given section and number, of the first group unless one is given. */
export function matchesOfRound(
	data: BracketData,
	section: RoundSection,
	number: number,
	groupId = data.group[0].id,
) {
	const round = data.round.find(
		(candidate) =>
			candidate.section === section &&
			candidate.number === number &&
			candidate.groupId === groupId,
	);
	if (!round) {
		throw new Error(`Round ${section} ${number} of group ${groupId} not found`);
	}

	return data.match.filter((match) => match.roundId === round.id);
}

/** Values keyed by match id regrouped by round as `"<section> <number>"`, in match order, `undefined` for a match without one. */
export function byRound<T>(values: Map<number, T>, data: BracketData) {
	const result: Record<string, (T | undefined)[]> = {};
	for (const round of data.round.toSorted((a, b) => a.id - b.id)) {
		const key = `${round.section} ${round.number}`;
		result[key] = [
			...(result[key] ?? []),
			...data.match
				.filter((match) => match.roundId === round.id)
				.map((match) => values.get(match.id)),
		];
	}

	return result;
}

/** The team that lost the decided match. */
export function loserOf(match: MatchData) {
	const loser =
		match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
	if (!match.winnerSide || typeof loser?.id !== "number") {
		throw new Error(`Match ${match.id} has no loser`);
	}

	return loser.id;
}

export const teamIds = (count: number) =>
	Array.from({ length: count }, (_, index) => index + 1);

/** Ids of the teams playing in the bracket's matches, ascending. */
export function participantIds(data: BracketData) {
	return [
		...new Set(
			data.match.flatMap((match) => [match.opponent1?.id, match.opponent2?.id]),
		),
	]
		.filter((id) => typeof id === "number")
		.sort((a, b) => a - b);
}
