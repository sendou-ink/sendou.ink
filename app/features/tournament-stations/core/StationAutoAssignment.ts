/**
 * Auto-assignment of a LAN tournament's stations: which playable matches no one has placed go on which
 * free stations. Matches go out in play order ({@link PlayOrder}), so a ready Winners Round 2 waits while
 * Winners Round 1 matches still wait for a station. Among matches of the same depth a team stays at the
 * station it just played on when that one is free (the team with more games played when both teams'
 * are), otherwise the match takes the free station highest on the list. A match whose team is still on
 * another station waits. A station is free when nothing playable is queued on it: the match goes in front
 * of queued matches that can't be played yet (e.g. a final whose teams aren't known), so an idle station
 * doesn't wait for them. A station gets one match at a time from here, and the queues organizers order by
 * hand are never reordered, nor are matches they moved to Waiting taken out of it.
 */
import * as R from "remeda";
import { isMatchByeCompleted } from "~/features/tournament-bracket/core/engine/status";
import type { MatchData } from "~/features/tournament-bracket/core/engine/types";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as PlayOrder from "./PlayOrder";

/** A match put on a station, in front of its queued matches that can't be played yet. */
interface StationAssignment {
	matchId: number;
	stationId: number;
}

/** The matches to put on stations right now, in the order they were picked. */
export function assignments({
	tournament,
	stationIds,
	placedMatches,
}: {
	tournament: Tournament;
	/** In their order, the first one is filled first. */
	stationIds: number[];
	/** Matches organizers or this assignment placed: queued on a station, or `stationId: null` for one kept in Waiting by hand. */
	placedMatches: Array<{ matchId: number; stationId: number | null }>;
}): StationAssignment[] {
	const playOrder = PlayOrder.byMatchId(tournament);
	const matches = startedBracketMatches(tournament);
	const isPlayable = (matchId: number) =>
		matches.get(matchId)?.status === "STARTED";

	const placedMatchIds = new Set(placedMatches.map((row) => row.matchId));
	const stationIdByMatchId = new Map(
		placedMatches.flatMap((row) =>
			row.stationId === null ? [] : [[row.matchId, row.stationId] as const],
		),
	);

	const occupiedStationIds = new Set(
		placedMatches.flatMap((row) =>
			row.stationId !== null && isPlayable(row.matchId) ? [row.stationId] : [],
		),
	);
	const freeStationIds = stationIds.filter(
		(stationId) => !occupiedStationIds.has(stationId),
	);
	if (freeStationIds.length === 0) return [];

	const teamIdsOnStations = new Set(
		placedMatches.flatMap((row) => {
			const match = matches.get(row.matchId)?.match;
			return row.stationId !== null && match && isPlayable(row.matchId)
				? teamIdsOf(match)
				: [];
		}),
	);

	const waiting = Array.from(matches.values()).flatMap(({ match, status }) => {
		const position = playOrder.get(match.id);
		return status === "STARTED" && !placedMatchIds.has(match.id) && position
			? [{ match, position }]
			: [];
	});

	const previousStationIdByTeamId = previousStationIds({
		matches,
		playOrder,
		stationIdByMatchId,
	});
	const gamesPlayedByTeamId = gamesPlayed(matches);

	const result: StationAssignment[] = [];
	const assign = (match: MatchData, stationId: number) => {
		result.push({ matchId: match.id, stationId });
		freeStationIds.splice(freeStationIds.indexOf(stationId), 1);
		for (const teamId of teamIdsOf(match)) teamIdsOnStations.add(teamId);
	};
	const isTeamFree = (match: MatchData) =>
		teamIdsOf(match).every((teamId) => !teamIdsOnStations.has(teamId));

	const depthGroups = R.pipe(
		waiting,
		R.sortBy(({ position }) => position.rank),
		R.groupBy(({ position }) => position.depth),
		R.entries(),
		R.map(([depth, group]) => ({
			depth: Number(depth),
			matches: group.map(({ match }) => match),
		})),
		R.sortBy(({ depth }) => depth),
	);

	for (const { matches: group } of depthGroups) {
		const assignedMatchIds = new Set<number>();

		for (const match of group) {
			if (!isTeamFree(match)) continue;

			const stayStationId = R.firstBy(
				teamIdsOf(match).flatMap((teamId) => {
					const stationId = previousStationIdByTeamId.get(teamId);
					return stationId !== undefined && freeStationIds.includes(stationId)
						? [{ stationId, gamesPlayed: gamesPlayedByTeamId.get(teamId) ?? 0 }]
						: [];
				}),
				[(option) => option.gamesPlayed, "desc"],
				(option) => stationIds.indexOf(option.stationId),
			)?.stationId;
			if (stayStationId === undefined) continue;

			assign(match, stayStationId);
			assignedMatchIds.add(match.id);
		}

		for (const match of group) {
			if (freeStationIds.length === 0) return result;
			if (assignedMatchIds.has(match.id) || !isTeamFree(match)) continue;

			assign(match, freeStationIds[0]);
		}

		if (freeStationIds.length === 0) return result;
	}

	return result;
}

function startedBracketMatches(tournament: Tournament) {
	const result = new Map<
		number,
		{ match: MatchData; status: "PENDING" | "STARTED" | "COMPLETED" }
	>();

	for (const bracket of tournament.brackets) {
		if (bracket.preview) continue;

		const statuses = bracket.matchStatuses();
		for (const match of bracket.data.match) {
			const status = statuses.get(match.id);
			if (status) result.set(match.id, { match, status });
		}
	}

	return result;
}

/** Station of each team's latest finished match, if it was played on one. */
function previousStationIds({
	matches,
	playOrder,
	stationIdByMatchId,
}: {
	matches: ReturnType<typeof startedBracketMatches>;
	playOrder: Map<number, PlayOrder.PlayOrderPosition>;
	stationIdByMatchId: Map<number, number>;
}) {
	const latestFinishedByTeamId = new Map<number, MatchData>();
	for (const { match, status } of matches.values()) {
		if (status !== "COMPLETED" || isMatchByeCompleted(match)) continue;

		for (const teamId of teamIdsOf(match)) {
			const latest = latestFinishedByTeamId.get(teamId);
			if (
				!latest ||
				(playOrder.get(match.id)?.rank ?? -1) >
					(playOrder.get(latest.id)?.rank ?? -1)
			) {
				latestFinishedByTeamId.set(teamId, match);
			}
		}
	}

	const result = new Map<number, number>();
	for (const [teamId, match] of latestFinishedByTeamId) {
		const stationId = stationIdByMatchId.get(match.id);
		if (stationId !== undefined) result.set(teamId, stationId);
	}

	return result;
}

function gamesPlayed(matches: ReturnType<typeof startedBracketMatches>) {
	const result = new Map<number, number>();
	for (const { match } of matches.values()) {
		const games = (match.opponent1?.score ?? 0) + (match.opponent2?.score ?? 0);
		for (const teamId of teamIdsOf(match)) {
			result.set(teamId, (result.get(teamId) ?? 0) + games);
		}
	}

	return result;
}

function teamIdsOf(match: MatchData) {
	return [match.opponent1?.id, match.opponent2?.id].filter(
		(teamId): teamId is number => typeof teamId === "number",
	);
}
