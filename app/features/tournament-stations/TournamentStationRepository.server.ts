import type { Transaction } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { DB, DBBoolean, Tables } from "~/db/tables";
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

/**
 * Matches placed on the tournament's stations, finished ones included, each station's queue in order.
 * `stationId: null` for a match an organizer moved to the Waiting lane.
 */
export function findMatchPlacementsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentMatchStation")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchStation.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select([
			"TournamentMatchStation.matchId",
			"TournamentMatchStation.stationId",
			"TournamentMatchStation.isAutoAssigned",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchStation.stationId", "asc")
		.orderBy("TournamentMatchStation.position", "asc")
		.execute();
}

/**
 * Puts each match on its station as auto-assigned, in front of the queue's unfinished matches (on a station
 * auto-assignment picks they can't be played yet). Skips matches someone placed in the meantime.
 */
export function insertAutoAssignedMatches(
	assignments: Array<{ matchId: number; stationId: number }>,
) {
	return db.transaction().execute(async (trx) => {
		for (const { matchId, stationId } of assignments) {
			const placed = await trx
				.selectFrom("TournamentMatchStation")
				.select("TournamentMatchStation.matchId")
				.where("TournamentMatchStation.matchId", "=", matchId)
				.executeTakeFirst();
			if (placed) continue;

			await insertIntoQueue(trx, {
				matchId,
				stationId,
				index: 0,
				isAutoAssigned: 1,
			});
		}
	});
}

/**
 * Takes the match off the station it's queued on and puts it in the queue of the given station at `index`,
 * counted among the queue's unfinished matches (finished ones stay at the front). `stationId: null` keeps it in the Waiting
 * lane, where auto-assignment leaves it. The moved match counts as placed by hand from then on.
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

		if (stationId === null) {
			await trx
				.insertInto("TournamentMatchStation")
				.values({ matchId, stationId: null, position: 0 })
				.execute();
			return;
		}

		await insertIntoQueue(trx, {
			matchId,
			stationId,
			index,
			isAutoAssigned: 0,
		});
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

/** Puts the match in the station's queue at `index` among its unfinished matches, finished ones staying at the front. */
async function insertIntoQueue(
	trx: Transaction<DB>,
	{
		matchId,
		stationId,
		index,
		isAutoAssigned,
	}: {
		matchId: number;
		stationId: number;
		index: number;
		isAutoAssigned: DBBoolean;
	},
) {
	const queue = await trx
		.selectFrom("TournamentMatchStation")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchStation.matchId",
		)
		.select([
			"TournamentMatchStation.matchId",
			"TournamentMatchStation.isAutoAssigned",
			"TournamentMatch.winnerSide",
		])
		.where("TournamentMatchStation.stationId", "=", stationId)
		.orderBy("TournamentMatchStation.position", "asc")
		.execute();

	const finished = queue.filter((row) => row.winnerSide !== null);
	const unfinished = queue
		.filter((row) => row.winnerSide === null)
		.toSpliced(index, 0, { matchId, isAutoAssigned, winnerSide: null });

	await trx
		.deleteFrom("TournamentMatchStation")
		.where("TournamentMatchStation.stationId", "=", stationId)
		.execute();
	await trx
		.insertInto("TournamentMatchStation")
		.values(
			[...finished, ...unfinished].map((row, position) => ({
				matchId: row.matchId,
				stationId,
				position,
				isAutoAssigned: row.isAutoAssigned,
			})),
		)
		.execute();
}
