import * as Engine from "../engine";
import type { BracketData, MatchData, RoundData } from "../engine/types";

type InvariantClass =
	/** A team has two matches it could be playing right now. */
	| "team-in-two-open-matches"
	/** A team appears twice in one round. */
	| "team-twice-in-round"
	/** A match has a winner although a team is missing. */
	| "winner-without-opponents"
	/** A match has more games won than its round's map count allows. */
	| "score-over-count"
	/** A team plays on in a section it was knocked out of. */
	| "eliminated-team-plays-on"
	/** Round robin: two teams meet more than once in a group. */
	| "duplicate-pairing";

interface Violation {
	class: InvariantClass;
	matchId?: number;
	detail: string;
}

/**
 * Checks that hold for the data of one stage after any sequence of engine operations, whatever the
 * results were.
 */
export function violations(data: BracketData): Violation[] {
	const stage = data.stage[0];
	if (!stage) return [];

	const result: Violation[] = [];
	const roundById = new Map(data.round.map((round) => [round.id, round]));
	const statuses = Engine.matchStatuses(data);
	const isElimination =
		stage.type === "single_elimination" || stage.type === "double_elimination";

	const openMatchByTeamId = new Map<number, MatchData>();
	const teamsOfRound = new Map<number, Set<number>>();
	const pairings = new Set<string>();

	for (const match of data.match) {
		const round = roundById.get(match.roundId);
		const teamIds = [match.opponent1?.id, match.opponent2?.id].filter(
			(id): id is number => typeof id === "number",
		);

		const roundTeams = teamsOfRound.get(match.roundId) ?? new Set<number>();
		teamsOfRound.set(match.roundId, roundTeams);
		for (const teamId of teamIds) {
			if (roundTeams.has(teamId)) {
				result.push({
					class: "team-twice-in-round",
					matchId: match.id,
					detail: `team ${teamId} in round ${match.roundId}`,
				});
			}
			roundTeams.add(teamId);
		}

		if (match.winnerSide) {
			const winner = match[match.winnerSide];
			const isBye = match.opponent1 === null || match.opponent2 === null;
			if (!winner?.id || (!isBye && teamIds.length !== 2)) {
				result.push({
					class: "winner-without-opponents",
					matchId: match.id,
					detail: `winner ${match.winnerSide}`,
				});
			}
		}

		if (round?.maps && scoreOverCount(match, round)) {
			result.push({
				class: "score-over-count",
				matchId: match.id,
				detail: `${match.opponent1?.score ?? 0}-${match.opponent2?.score ?? 0} in ${round.maps.type} ${round.maps.count}`,
			});
		}

		if (stage.type === "round_robin" && teamIds.length === 2) {
			const key = `${match.groupId}:${Math.min(...teamIds)}-${Math.max(...teamIds)}`;
			if (pairings.has(key)) {
				result.push({
					class: "duplicate-pairing",
					matchId: match.id,
					detail: key,
				});
			}
			pairings.add(key);
		}

		const isOpen =
			teamIds.length === 2 &&
			!match.winnerSide &&
			(stage.type === "round_robin"
				? statuses.get(match.id) === "STARTED" && !Engine.isMatchStarted(match)
				: true);
		if (!isOpen) continue;

		for (const teamId of teamIds) {
			const other = openMatchByTeamId.get(teamId);
			if (other) {
				result.push({
					class: "team-in-two-open-matches",
					matchId: match.id,
					detail: `team ${teamId} also in match ${other.id}`,
				});
			}
			openMatchByTeamId.set(teamId, match);
		}
	}

	if (isElimination) {
		result.push(...eliminatedTeamsPlayingOn(data, roundById));
	}

	return result;
}

function scoreOverCount(match: MatchData, round: RoundData) {
	if (!round.maps) return false;

	const scores = [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0];
	if (round.maps.type === "PLAY_ALL") {
		return scores[0] + scores[1] > round.maps.count;
	}

	const winsNeeded = Math.ceil(round.maps.count / 2);
	return (
		scores[0] > winsNeeded ||
		scores[1] > winsNeeded ||
		(scores[0] === winsNeeded && scores[1] === winsNeeded)
	);
}

/** A team that lost in a section can't be in a later round of the same section (a loss in the losers section also ends the finals). */
function eliminatedTeamsPlayingOn(
	data: BracketData,
	roundById: Map<number, RoundData>,
): Violation[] {
	const result: Violation[] = [];
	const lostInRound = new Map<string, number>();
	const key = (groupId: number, section: string | null, teamId: number) =>
		`${groupId}:${section}:${teamId}`;

	for (const match of data.match) {
		const round = roundById.get(match.roundId);
		if (!round || !match.winnerSide || round.section === "finals") continue;
		if (!match.opponent1 || !match.opponent2) continue;

		const loser =
			match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
		if (typeof loser.id !== "number") continue;

		lostInRound.set(key(match.groupId, round.section, loser.id), round.number);
	}

	for (const match of data.match) {
		const round = roundById.get(match.roundId);
		if (!round) continue;

		for (const opponent of [match.opponent1, match.opponent2]) {
			if (typeof opponent?.id !== "number") continue;

			const lostAt = lostInRound.get(
				key(match.groupId, round.section, opponent.id),
			);
			const lostInLosers = lostInRound.get(
				key(match.groupId, "losers", opponent.id),
			);
			const playsOn =
				round.section === "finals"
					? data.stage[0].type === "double_elimination" &&
						lostInLosers !== undefined
					: lostAt !== undefined && round.number > lostAt;
			if (!playsOn) continue;

			result.push({
				class: "eliminated-team-plays-on",
				matchId: match.id,
				detail: `team ${opponent.id} in ${round.section} round ${round.number}`,
			});
		}
	}

	return result;
}
