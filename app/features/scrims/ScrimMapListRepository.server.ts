import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import type { ScrimSide } from "./scrims-types";

type UpsertMapListArgs = Omit<TablesInsertable["ScrimMapList"], "updatedAt">;

/**
 * Inserts a map list row for the given side, replacing any existing row for
 * the same `(scrimPostId, side)` pair.
 */
export async function upsertMapList(args: UpsertMapListArgs): Promise<void> {
	const now = databaseTimestampNow();

	await db
		.insertInto("ScrimMapList")
		.values({
			scrimPostId: args.scrimPostId,
			side: args.side,
			source: args.source,
			tournamentId: args.tournamentId ?? null,
			serializedPool: args.serializedPool ?? null,
			updatedAt: now,
		})
		.onConflict((oc) =>
			oc.columns(["scrimPostId", "side"]).doUpdateSet({
				source: args.source,
				tournamentId: args.tournamentId ?? null,
				serializedPool: args.serializedPool ?? null,
				updatedAt: now,
			}),
		)
		.execute();
}

/** Deletes a side's map list, if one exists. */
export async function deleteMapList(
	scrimPostId: number,
	side: ScrimSide,
): Promise<void> {
	await db
		.deleteFrom("ScrimMapList")
		.where("scrimPostId", "=", scrimPostId)
		.where("side", "=", side)
		.execute();
}

/** Returns all submitted map lists for the scrim. */
export function findMapListsByScrimPostId(scrimPostId: number) {
	return db
		.selectFrom("ScrimMapList")
		.select(["side", "source", "tournamentId", "serializedPool", "updatedAt"])
		.where("scrimPostId", "=", scrimPostId)
		.execute();
}
