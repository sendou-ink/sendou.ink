import { type Kysely, sql } from "kysely";

/**
 * `TournamentTeam.isLooking` used to stay set after the tournament had started. Starting a
 * bracket clears it from now on, so the sidebar friend activity no longer joins every past
 * pickup registration.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await sql`update "TournamentTeam" set "isLooking" = 0 where "isLooking" = 1 and "tournamentId" in (select "tournamentId" from "TournamentStage")`.execute(
		db,
	);
}
