/**
 * The station each unfinished match of a LAN tournament is queued on, the way players see it on the match page,
 * the bracket and the header status. A station also goes by a short label where space is tight: the number its
 * name ends with ("3" for "Station 3"), unless another station of the tournament would get the same label, then its
 * whole name. The first unfinished match of a station's queue is the one to be played there next (or now).
 */
import type { Tables } from "~/db/tables";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

export interface MatchStation {
	id: number;
	name: string;
	/** E.g. "3" for "Station 3". */
	shortName: string;
	locationNote: string | null;
	/** The first unfinished match queued on the station: played now or next on it, no wait worth estimating. */
	isFirstInQueue: boolean;
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

	const result = new Map<number, MatchStation>();
	const stationIdsWithFirst = new Set<number>();
	for (const placement of placements) {
		if (placement.stationId === null) continue;

		const station = stationsById.get(placement.stationId);
		if (!station || isFinished(tournament, placement.matchId)) continue;

		result.set(placement.matchId, {
			...station,
			isFirstInQueue: !stationIdsWithFirst.has(station.id),
		});
		stationIdsWithFirst.add(station.id);
	}

	return result;
}

function isFinished(tournament: MatchStatusSource, matchId: number) {
	return (
		tournament.matchIdToBracketIdx(matchId) === null ||
		tournament.matchStatusById(matchId) === "COMPLETED"
	);
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
