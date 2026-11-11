import * as R from "remeda";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { StreamAccount } from "~/features/live-streams/live-streams-constants";

type SetStationsArgs = {
	tournamentId: number;
	/** Every station of the tournament in order, ones left out are deleted along with their queues. */
	stations: Array<{
		/** `null` for a new station. */
		id: number | null;
		name: Tables["TournamentStation"]["name"];
		locationNote: Tables["TournamentStation"]["locationNote"];
		castAccount: StreamAccount | null;
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
			"TournamentStation.castAccount",
		])
		.where("TournamentStation.tournamentId", "=", tournamentId)
		.orderBy("TournamentStation.position", "asc")
		.execute();
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
				castAccount: station.castAccount
					? JSON.stringify(station.castAccount)
					: null,
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
