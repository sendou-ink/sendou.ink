import { db } from "~/db/sql";

export function save({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}) {
	return db
		.insertInto("SavedTournament")
		.values({ userId, tournamentId })
		.onConflict((oc) => oc.columns(["userId", "tournamentId"]).doNothing())
		.execute();
}

export function unsave({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}) {
	return db
		.deleteFrom("SavedTournament")
		.where("userId", "=", userId)
		.where("tournamentId", "=", tournamentId)
		.execute();
}

export async function isSaved({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}): Promise<boolean> {
	const row = await db
		.selectFrom("SavedTournament")
		.select("id")
		.where("userId", "=", userId)
		.where("tournamentId", "=", tournamentId)
		.executeTakeFirst();

	return Boolean(row);
}

export async function findTournamentIdsByUserId(
	userId: number,
): Promise<number[]> {
	const rows = await db
		.selectFrom("SavedTournament")
		.select("tournamentId")
		.where("userId", "=", userId)
		.execute();

	return rows.map((r) => r.tournamentId);
}

export function deleteByTournamentId(tournamentId: number) {
	return db
		.deleteFrom("SavedTournament")
		.where("tournamentId", "=", tournamentId)
		.execute();
}
