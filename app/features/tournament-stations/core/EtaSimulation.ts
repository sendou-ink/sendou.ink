/**
 * ETA simulation of a LAN tournament: when its unfinished matches are expected to start. The matches are
 * played out on the stations: a free station plays the first match of its queue that is ready by then, else
 * the first ready match no one placed in play order ({@link PlayOrder}), the way auto-assignment would fill it.
 * A match is ready once the matches feeding it and its teams' earlier matches have ended and its bracket's
 * start time has passed. A station needs setup time before each match for the teams to swap places, except for the
 * match played now and the one queued after it: its teams wait by the station. Without stations every match starts
 * as soon as it is ready.
 *
 * Every set's length comes from the games it has left: the simulation runs once with every set ending in
 * a sweep (best case) and once with every set going the distance (worst case), so each estimate is a range.
 * A bracket yet to start is estimated to start at its start time, or once its source brackets end if later
 * (swiss rounds not generated yet aren't counted).
 */
import { minutesToMilliseconds } from "date-fns";
import * as R from "remeda";
import type { TournamentRoundMaps } from "~/db/tables-json";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type { MatchData } from "~/features/tournament-bracket/core/engine/types";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as PlayOrder from "./PlayOrder";

/** Minutes one game takes, getting the next game going included. */
const MINUTES_PER_GAME = 7;
/** Minutes before a match on a station for the previous teams to get off and its teams to set up. */
const SETUP_MINUTES = 5;
/** Games of a set whose round has no map list, as a best of. */
const FALLBACK_BEST_OF = 3;

/** @internal */
export const ETA_CONSTANTS = { MINUTES_PER_GAME, SETUP_MINUTES };

/** Estimated time range, as timestamps in milliseconds. */
export interface EtaRange {
	earliest: number;
	latest: number;
}

export interface EtaSimulationResult {
	/** Estimated start of each unfinished match of the started brackets, missing when it can't be estimated. */
	matchStarts: Map<number, EtaRange>;
	/** Estimated start of each bracket yet to start that has a start time and whose source brackets have started, keyed by bracket index. */
	bracketStarts: Map<number, EtaRange>;
}

type Scenario = "best" | "worst";

interface SimulatedMatch {
	id: number;
	rank: number;
	bracketIdx: number;
	/** Matches that have to end before this one can start: its feeders and its teams' previous matches. */
	dependencyIds: number[];
	/** Its bracket's start time, or now. */
	earliestStart: number;
	durations: Record<Scenario, number>;
}

/** Estimated starts of the tournament's unfinished matches and of its brackets yet to start. */
export function simulate({
	tournament,
	stationIds,
	placements,
	now,
}: {
	tournament: Tournament;
	/** In their order, the first one is filled first. */
	stationIds: number[];
	/** Each station's queue in order, finished matches included, and the matches kept in Waiting (`stationId: null`). */
	placements: Array<{ matchId: number; stationId: number | null }>;
	/** Timestamp in milliseconds. */
	now: number;
}): EtaSimulationResult {
	const matches = simulatedMatches(tournament, now);

	const queues = new Map(
		stationIds.map((stationId) => [
			stationId,
			placements
				.filter((row) => row.stationId === stationId)
				.flatMap((row) => {
					const match = matches.get(row.matchId);
					return match ? [match] : [];
				}),
		]),
	);

	const runs = {
		best: run({ matches, queues, scenario: "best", now }),
		worst: run({ matches, queues, scenario: "worst", now }),
	};

	const matchStarts = new Map<number, EtaRange>();
	for (const [matchId, best] of runs.best) {
		const worst = runs.worst.get(matchId);
		if (!worst) continue;

		matchStarts.set(matchId, {
			earliest: Math.min(best.start, worst.start),
			latest: Math.max(best.start, worst.start),
		});
	}

	return {
		matchStarts,
		bracketStarts: bracketStarts({ tournament, matches, runs, now }),
	};
}

function simulatedMatches(tournament: Tournament, now: number) {
	const playOrder = PlayOrder.byMatchId(tournament);

	const entries: Array<
		Omit<SimulatedMatch, "dependencyIds"> & {
			feederIds: number[];
			teamIds: number[];
		}
	> = [];
	for (const bracket of tournament.brackets) {
		if (bracket.preview) continue;

		const statuses = bracket.matchStatuses();
		const mapsByRoundId = new Map(
			bracket.data.round.map((round) => [round.id, round.maps ?? null]),
		);
		const feederIdsByMatchId = new Map<number, number[]>();
		for (const [matchId, nextMatchIds] of Engine.nextMatchIdsByMatchId(
			bracket.data,
		)) {
			for (const nextMatchId of nextMatchIds) {
				feederIdsByMatchId.set(nextMatchId, [
					...(feederIdsByMatchId.get(nextMatchId) ?? []),
					matchId,
				]);
			}
		}

		const unfinishedIds = new Set(
			bracket.data.match
				.filter((match) => statuses.get(match.id) !== "COMPLETED")
				.map((match) => match.id),
		);

		for (const match of bracket.data.match) {
			const position = playOrder.get(match.id);
			const isBye = !match.opponent1 || !match.opponent2;
			// e.g. a grand finals reset, played only if the grand finals call for it
			const hasNoTeamsComing =
				teamIdsOf(match).length === 0 &&
				!(feederIdsByMatchId.get(match.id) ?? []).some((feederId) =>
					unfinishedIds.has(feederId),
				);
			if (
				!position ||
				isBye ||
				hasNoTeamsComing ||
				!unfinishedIds.has(match.id)
			) {
				continue;
			}

			entries.push({
				id: match.id,
				rank: position.rank,
				bracketIdx: bracket.idx,
				feederIds: feederIdsByMatchId.get(match.id) ?? [],
				teamIds: teamIdsOf(match),
				earliestStart: Math.max(now, bracket.startTime?.getTime() ?? 0),
				durations: durations(match, mapsByRoundId.get(match.roundId) ?? null),
			});
		}
	}

	const inRankOrder = R.sortBy(entries, (entry) => entry.rank);
	const simulatedIds = new Set(inRankOrder.map((entry) => entry.id));
	const previousMatchIdByTeamId = new Map<number, number>();

	const result = new Map<number, SimulatedMatch>();
	for (const { feederIds, teamIds, ...entry } of inRankOrder) {
		const teamPreviousIds = teamIds.flatMap((teamId) => {
			const previousId = previousMatchIdByTeamId.get(teamId);
			return previousId === undefined ? [] : [previousId];
		});
		for (const teamId of teamIds) previousMatchIdByTeamId.set(teamId, entry.id);

		result.set(entry.id, {
			...entry,
			dependencyIds: R.unique([
				...feederIds.filter((feederId) => simulatedIds.has(feederId)),
				...teamPreviousIds,
			]),
		});
	}

	return result;
}

function durations(
	match: MatchData,
	maps: TournamentRoundMaps | null,
): Record<Scenario, number> {
	const count = maps?.count ?? FALLBACK_BEST_OF;
	const scores = [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0];

	const gamesLeft = (() => {
		if (maps?.type === "PLAY_ALL") {
			const left = Math.max(0, count - scores[0] - scores[1]);
			return { best: left, worst: left };
		}

		const winsNeeded = Math.ceil(count / 2);
		const [left1, left2] = scores.map((score) =>
			Math.max(0, winsNeeded - score),
		);
		return {
			best: Math.min(left1, left2),
			worst: Math.max(0, left1 + left2 - 1),
		};
	})();

	return {
		best: minutesToMilliseconds(gamesLeft.best * MINUTES_PER_GAME),
		worst: minutesToMilliseconds(gamesLeft.worst * MINUTES_PER_GAME),
	};
}

function run({
	matches,
	queues,
	scenario,
	now,
}: {
	matches: Map<number, SimulatedMatch>;
	queues: Map<number, SimulatedMatch[]>;
	scenario: Scenario;
	now: number;
}) {
	const scheduled = new Map<number, { start: number; end: number }>();
	const schedule = (match: SimulatedMatch, start: number) => {
		const end = start + match.durations[scenario];
		scheduled.set(match.id, { start, end });

		return end;
	};

	const readyAt = (match: SimulatedMatch) => {
		let result = match.earliestStart;
		for (const dependencyId of match.dependencyIds) {
			const dependency = scheduled.get(dependencyId);
			if (!dependency) return null;

			result = Math.max(result, dependency.end);
		}

		return result;
	};

	const inRankOrder = R.sortBy(Array.from(matches.values()), (m) => m.rank);

	if (queues.size === 0) {
		for (const match of inRankOrder) {
			const start = readyAt(match);
			if (start !== null) schedule(match, start);
		}

		return scheduled;
	}

	const queuedMatchIds = new Set(
		Array.from(queues.values()).flatMap((queue) => queue.map((m) => m.id)),
	);
	const unplaced = inRankOrder.filter((match) => !queuedMatchIds.has(match.id));
	const freeAtByStationId = new Map(
		Array.from(queues.keys()).map((stationId) => [stationId, now]),
	);
	const playedCountByStationId = new Map<number, number>();
	const playingNowStationIds = new Set<number>();
	const setupBefore = ({
		stationId,
		startsAt,
		isQueued,
	}: {
		stationId: number;
		startsAt: number;
		/** Queued on the station rather than taken from the matches on no station, whose teams are only sent there then. */
		isQueued: boolean;
	}) => {
		const playedCount = playedCountByStationId.get(stationId) ?? 0;
		const isPlayedNow = playedCount === 0 && startsAt === now;
		const isNextAfterPlayedNow =
			isQueued && playedCount === 1 && playingNowStationIds.has(stationId);

		return isPlayedNow || isNextAfterPlayedNow
			? 0
			: minutesToMilliseconds(SETUP_MINUTES);
	};

	let time: number | undefined = now;
	while (time !== undefined) {
		const currentTime: number = time;
		const isReady = (match: SimulatedMatch) => {
			const ready = readyAt(match);
			return !scheduled.has(match.id) && ready !== null && ready <= currentTime;
		};

		let pickedAny = true;
		while (pickedAny) {
			pickedAny = false;
			for (const [stationId, queue] of queues) {
				if (freeAtByStationId.get(stationId)! > currentTime) continue;

				const queuedMatch = queue.find(isReady);
				const match = queuedMatch ?? unplaced.find(isReady);
				if (!match) continue;

				if (currentTime === now) playingNowStationIds.add(stationId);
				const setup = setupBefore({
					stationId,
					startsAt: currentTime,
					isQueued: Boolean(queuedMatch),
				});
				freeAtByStationId.set(stationId, schedule(match, currentTime + setup));
				playedCountByStationId.set(
					stationId,
					(playedCountByStationId.get(stationId) ?? 0) + 1,
				);
				pickedAny = true;
			}
		}

		const upcomingTimes = [
			...freeAtByStationId.values(),
			...inRankOrder.flatMap((match) => {
				const ready = scheduled.has(match.id) ? null : readyAt(match);
				return ready === null ? [] : [ready];
			}),
		].filter((candidate) => candidate > currentTime);

		time = upcomingTimes.length > 0 ? Math.min(...upcomingTimes) : undefined;
	}

	return scheduled;
}

function bracketStarts({
	tournament,
	matches,
	runs,
	now,
}: {
	tournament: Tournament;
	matches: Map<number, SimulatedMatch>;
	runs: Record<Scenario, Map<number, { start: number; end: number }>>;
	now: number;
}) {
	const result = new Map<number, EtaRange>();

	for (const bracket of tournament.bracketsMeta) {
		if (!bracket.preview || !bracket.startTime) continue;

		const sourceIdxs = (bracket.sources ?? []).map(
			(source) => source.bracketIdx,
		);
		const sourcesStarted = sourceIdxs.every(
			(idx) => tournament.bracketMetaByIdx(idx)?.preview === false,
		);
		if (!sourcesStarted) continue;

		const sourceMatchIds = Array.from(matches.values())
			.filter((match) => sourceIdxs.includes(match.bracketIdx))
			.map((match) => match.id);
		const startsAt = (scenario: Scenario) => {
			const ends = sourceMatchIds.map((id) => runs[scenario].get(id)?.end);
			if (ends.some((end) => end === undefined)) return null;

			return Math.max(now, bracket.startTime!.getTime(), ...(ends as number[]));
		};

		const earliest = startsAt("best");
		const latest = startsAt("worst");
		if (earliest === null || latest === null) continue;

		result.set(bracket.idx, { earliest, latest });
	}

	return result;
}

function teamIdsOf(match: MatchData) {
	return [match.opponent1?.id, match.opponent2?.id].filter(
		(teamId): teamId is number => typeof teamId === "number",
	);
}
