import { db } from "~/db/sql";

/**
 * Moves every season stamped row (skills and the aggregated stats keyed off them)
 * to the given season. Concluding a match stamps its results with the season that
 * is current then, so matches backdated into an older season still leave their
 * results in the ongoing one — a seed that needs a season looking played out and
 * over has no other way to ask for one.
 */
export async function reseason(season: number) {
	await db.updateTable("Skill").set({ season }).execute();
	await db.updateTable("MapResult").set({ season }).execute();
	await db.updateTable("PlayerResult").set({ season }).execute();
}
