import type { NotNull, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";

export function createMany(
	weapons: TablesInsertable["ReportedWeapon"][],
	trx?: Transaction<DB>,
) {
	if (weapons.length === 0) return;

	return (trx ?? db).insertInto("ReportedWeapon").values(weapons).execute();
}

export async function replaceByMatchId(
	matchId: number,
	weapons: TablesInsertable["ReportedWeapon"][],
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	const groupMatchMaps = await executor
		.selectFrom("GroupMatchMap")
		.select("id")
		.where("matchId", "=", matchId)
		.execute();

	if (groupMatchMaps.length > 0) {
		await executor
			.deleteFrom("ReportedWeapon")
			.where(
				"groupMatchMapId",
				"in",
				groupMatchMaps.map((m) => m.id),
			)
			.execute();
	}

	if (weapons.length > 0) {
		await executor.insertInto("ReportedWeapon").values(weapons).execute();
	}
}

export async function findByMatchId(matchId: number) {
	const rows = await db
		.selectFrom("ReportedWeapon")
		.innerJoin(
			"GroupMatchMap",
			"GroupMatchMap.id",
			"ReportedWeapon.groupMatchMapId",
		)
		.select([
			"ReportedWeapon.groupMatchMapId",
			"ReportedWeapon.weaponSplId",
			"ReportedWeapon.userId",
			"GroupMatchMap.index as mapIndex",
		])
		.where("GroupMatchMap.matchId", "=", matchId)
		.orderBy("GroupMatchMap.index", "asc")
		.orderBy("ReportedWeapon.userId", "asc")
		.$narrowType<{ groupMatchMapId: NotNull }>()
		.execute();

	if (rows.length === 0) return null;

	return rows;
}
