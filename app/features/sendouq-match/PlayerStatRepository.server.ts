import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";

export function upsertMapResults(
	results: Pick<
		Tables["MapResult"],
		"losses" | "wins" | "userId" | "mode" | "stageId" | "season"
	>[],
	trx?: Transaction<DB>,
) {
	if (results.length === 0) return;

	const executor = trx ?? db;

	return executor
		.insertInto("MapResult")
		.values(results)
		.onConflict((oc) =>
			oc.columns(["userId", "stageId", "mode", "season"]).doUpdateSet((eb) => ({
				wins: eb("MapResult.wins", "+", eb.ref("excluded.wins")),
				losses: eb("MapResult.losses", "+", eb.ref("excluded.losses")),
			})),
		)
		.execute();
}

export function upsertPlayerResults(
	results: Tables["PlayerResult"][],
	trx?: Transaction<DB>,
) {
	if (results.length === 0) return;

	const executor = trx ?? db;

	return executor
		.insertInto("PlayerResult")
		.values(results)
		.onConflict((oc) =>
			oc
				.columns(["ownerUserId", "otherUserId", "type", "season"])
				.doUpdateSet((eb) => ({
					mapWins: eb("PlayerResult.mapWins", "+", eb.ref("excluded.mapWins")),
					mapLosses: eb(
						"PlayerResult.mapLosses",
						"+",
						eb.ref("excluded.mapLosses"),
					),
					setWins: eb("PlayerResult.setWins", "+", eb.ref("excluded.setWins")),
					setLosses: eb(
						"PlayerResult.setLosses",
						"+",
						eb.ref("excluded.setLosses"),
					),
				})),
		)
		.execute();
}
