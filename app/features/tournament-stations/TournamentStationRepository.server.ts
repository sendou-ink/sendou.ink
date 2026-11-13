import type { Transaction } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";

type SetStationsArgs = {
	tournamentId: number;
	/** Every station of the tournament in order, ones left out are deleted along with their queues. */
	stations: Array<{
		/** `null` for a new station. */
		id: number | null;
		name: Tables["TournamentStation"]["name"];
		locationNote: Tables["TournamentStation"]["locationNote"];
	}>;
	autoAssign: boolean;
};

/** Stations of the tournament in their order. */
export function findAllByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentStation")
		.select([
			"TournamentStation.id",
			"TournamentStation.name",
			"TournamentStation.locationNote",
		])
		.where("TournamentStation.tournamentId", "=", tournamentId)
		.orderBy("TournamentStation.position", "asc")
		.execute();
}

/** Matches queued on the tournament's stations, finished ones included, each station's queue in order. */
export function findQueuedMatchesByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentMatchStation")
		.innerJoin(
			"TournamentStation",
			"TournamentStation.id",
			"TournamentMatchStation.stationId",
		)
		.select([
			"TournamentMatchStation.matchId",
			"TournamentMatchStation.stationId",
		])
		.where("TournamentStation.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchStation.stationId", "asc")
		.orderBy("TournamentMatchStation.position", "asc")
		.execute();
}

/**
 * Takes the match off the station it's queued on and puts it in the queue of the given station at `index`,
 * counted among the queue's unfinished matches (finished ones stay at the front). `stationId: null` leaves it on no station.
 * With `audit` a change of station (not a reorder within one) is written to the tournament's audit log.
 */
export function moveMatch({
	matchId,
	stationId,
	index,
	audit,
}: {
	matchId: number;
	stationId: number | null;
	index: number;
	audit?: { tournamentId: number; matchName: string };
}) {
	return db.transaction().execute(async (trx) => {
		const previousStationId =
			(
				await trx
					.selectFrom("TournamentMatchStation")
					.select("TournamentMatchStation.stationId")
					.where("TournamentMatchStation.matchId", "=", matchId)
					.executeTakeFirst()
			)?.stationId ?? null;

		if (audit && previousStationId !== stationId) {
			await TournamentAuditLogRepository.insertTournamentEvent(
				{
					tournamentId: audit.tournamentId,
					type: "MATCH_STATION_CHANGED",
					metadata: {
						matchName: audit.matchName,
						fromStationName: await stationName(trx, previousStationId),
						toStationName: await stationName(trx, stationId),
					},
				},
				trx,
			);
		}

		await trx
			.deleteFrom("TournamentMatchStation")
			.where("TournamentMatchStation.matchId", "=", matchId)
			.execute();

		if (stationId === null) return;

		const queue = await trx
			.selectFrom("TournamentMatchStation")
			.innerJoin(
				"TournamentMatch",
				"TournamentMatch.id",
				"TournamentMatchStation.matchId",
			)
			.select(["TournamentMatchStation.matchId", "TournamentMatch.winnerSide"])
			.where("TournamentMatchStation.stationId", "=", stationId)
			.orderBy("TournamentMatchStation.position", "asc")
			.execute();

		const finishedMatchIds = queue
			.filter((row) => row.winnerSide !== null)
			.map((row) => row.matchId);
		const unfinishedMatchIds = queue
			.filter((row) => row.winnerSide === null)
			.map((row) => row.matchId)
			.toSpliced(index, 0, matchId);

		await trx
			.deleteFrom("TournamentMatchStation")
			.where("TournamentMatchStation.stationId", "=", stationId)
			.execute();
		await trx
			.insertInto("TournamentMatchStation")
			.values(
				[...finishedMatchIds, ...unfinishedMatchIds].map(
					(queuedMatchId, position) => ({
						matchId: queuedMatchId,
						stationId,
						position,
					}),
				),
			)
			.execute();
	});
}

/**
 * Replaces the stations of the tournament, keeping the ids (and queued matches) of the existing ones
 * given, and saves whether playable matches are put on stations automatically.
 */
export function setStations({
	tournamentId,
	stations,
	autoAssign,
}: SetStationsArgs) {
	return db.transaction().execute(async (trx) => {
		const keptIds = stations.map((station) => station.id).filter(R.isNonNull);

		let deleteQuery = trx
			.deleteFrom("TournamentStation")
			.where("TournamentStation.tournamentId", "=", tournamentId);
		if (keptIds.length > 0) {
			deleteQuery = deleteQuery.where(
				"TournamentStation.id",
				"not in",
				keptIds,
			);
		}
		await deleteQuery.execute();

		const rows = stations.map((station, position) => ({
			id: station.id,
			values: {
				name: station.name,
				locationNote: station.locationNote,
				position,
			},
		}));

		for (const row of rows) {
			if (row.id === null) continue;

			await trx
				.updateTable("TournamentStation")
				.set(row.values)
				.where("TournamentStation.id", "=", row.id)
				.where("TournamentStation.tournamentId", "=", tournamentId)
				.execute();
		}

		const newStations = rows
			.filter((row) => row.id === null)
			.map((row) => ({ ...row.values, tournamentId }));
		if (newStations.length > 0) {
			await trx.insertInto("TournamentStation").values(newStations).execute();
		}

		const { settings } = await trx
			.selectFrom("Tournament")
			.select("Tournament.settings")
			.where("Tournament.id", "=", tournamentId)
			.executeTakeFirstOrThrow();
		await trx
			.updateTable("Tournament")
			.set({
				settings: JSON.stringify({
					...settings,
					autoAssignStations: autoAssign,
				}),
			})
			.where("Tournament.id", "=", tournamentId)
			.execute();
	});
}

async function stationName(trx: Transaction<DB>, stationId: number | null) {
	if (stationId === null) return null;

	const station = await trx
		.selectFrom("TournamentStation")
		.select("TournamentStation.name")
		.where("TournamentStation.id", "=", stationId)
		.executeTakeFirstOrThrow();

	return station.name;
}
