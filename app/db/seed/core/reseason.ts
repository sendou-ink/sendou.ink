import { db } from "~/db/sql";

/**
 * Moves every season stamped row (skills and aggregated stats) to `season`. Concluding stamps the current
 * season, so backdated matches still leave their results in the ongoing one.
 */
export async function reseason(season: number) {
	await db.updateTable("Skill").set({ season }).execute();
	await db.updateTable("MapResult").set({ season }).execute();
	await db.updateTable("PlayerResult").set({ season }).execute();
}
