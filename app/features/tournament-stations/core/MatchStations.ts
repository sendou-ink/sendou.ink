/**
 * The station each unfinished match of a LAN tournament is queued on, the way players see it on the match page,
 * the bracket and the header status. A station also goes by a short label where space is tight: the number its
 * name ends with ("3" for "Station 3"), unless another station of the tournament would get the same label, then its
 * whole name. The first playable match of a station's queue is the one played there now, as on the stations board.
 */
import type { Tables } from "~/db/tables";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

export interface MatchStation {
	id: number;
	name: string;
	/** E.g. "3" for "Station 3". */
	shortName: string;
	locationNote: string | null;
	/** The first playable match queued on the station, the one played on it now: no wait worth estimating. */
	isNow: boolean;
}

type MatchStatusSource = Pick<
	Tournament,
	"matchIdToBracketIdx" | "matchStatusById"
>;

/** Station of each unfinished match queued on one, matches on no station (incl. held in Waiting) left out. */
export function byMatchId({
	tournament,
	stations,
	placements,
}: {
	tournament: MatchStatusSource;
	stations: Array<
		Pick<Tables["TournamentStation"], "id" | "name" | "locationNote">
	>;
	/** Each station's queue in order. */
	placements: Array<
		Pick<Tables["TournamentMatchStation"], "matchId" | "stationId">
	>;
}): Map<number, MatchStation> {
	const shortNames = shortNamesById(stations);
	const stationsById = new Map(
		stations.map((station) => [
			station.id,
			{
				id: station.id,
				name: station.name,
				shortName: shortNames.get(station.id) ?? station.name,
				locationNote: station.locationNote,
			},
		]),
	);

	const nowMatchIds = new Set(
		nowMatchIdByStationId({ tournament, placements }).values(),
	);

	const result = new Map<number, MatchStation>();
	for (const placement of placements) {
		if (placement.stationId === null) continue;

		const station = stationsById.get(placement.stationId);
		const status = queuedMatchStatus(tournament, placement.matchId);
		if (!station || !status || status === "COMPLETED") continue;

		result.set(placement.matchId, {
			...station,
			isNow: nowMatchIds.has(placement.matchId),
		});
	}

	return result;
}

/** Status of a match placed on a station, `null` when it isn't in one of the tournament's started brackets. */
export function queuedMatchStatus(
	tournament: MatchStatusSource,
	matchId: number,
) {
	if (tournament.matchIdToBracketIdx(matchId) === null) return null;

	return tournament.matchStatusById(matchId);
}

/** Each station's Now match, the first playable one of its queue, keyed by station id. Stations with none are left out. */
export function nowMatchIdByStationId({
	tournament,
	placements,
}: {
	tournament: MatchStatusSource;
	/** Each station's queue in order. */
	placements: Array<
		Pick<Tables["TournamentMatchStation"], "matchId" | "stationId">
	>;
}): Map<number, number> {
	const result = new Map<number, number>();
	for (const { matchId, stationId } of placements) {
		if (stationId === null || result.has(stationId)) continue;

		if (queuedMatchStatus(tournament, matchId) === "STARTED") {
			result.set(stationId, matchId);
		}
	}

	return result;
}

function shortNamesById(stations: Array<{ id: number; name: string }>) {
	const candidates = stations.map((station) => ({
		id: station.id,
		name: station.name,
		shortName: station.name.trim().match(/(?:^|\D)(\d+)$/)?.[1] ?? null,
	}));

	const isUnique = (shortName: string) =>
		candidates.filter(
			(candidate) =>
				candidate.shortName === shortName || candidate.name === shortName,
		).length === 1;

	return new Map(
		candidates.map((candidate) => [
			candidate.id,
			candidate.shortName && isUnique(candidate.shortName)
				? candidate.shortName
				: candidate.name,
		]),
	);
}
