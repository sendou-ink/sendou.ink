import { db } from "~/db/sql";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";

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

export async function upcoming(
	userId: number,
): Promise<ShowcaseCalendarEvent[]> {
	const [savedIds, tournaments] = await Promise.all([
		findTournamentIdsByUserId(userId),
		ShowcaseTournaments.upcomingTournaments(),
	]);

	return tournaments.filter((t) => savedIds.includes(t.id));
}

export function deleteByTournamentId(tournamentId: number) {
	return db
		.deleteFrom("SavedTournament")
		.where("tournamentId", "=", tournamentId)
		.execute();
}
