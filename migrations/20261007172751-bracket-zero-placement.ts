import { type Kysely, sql } from "kysely";

/**
 * Placements parsing let "-0" and ranges starting from zero through, saving a
 * placement of 0 that crashed the tournament page. Zeros are dropped and a
 * source left without placements takes the winner instead.
 */
export async function up(db: Kysely<any>): Promise<void> {
	const tournaments = await sql<{ id: number; settings: string }>`
		select "Tournament"."id", "Tournament"."settings"
		from "Tournament",
			json_each("Tournament"."settings", '$.bracketProgression') as "bracket",
			json_each("bracket"."value", '$.sources') as "source",
			json_each("source"."value", '$.placements') as "placement"
		where "placement"."value" = 0
		group by "Tournament"."id"
	`.execute(db);

	for (const tournament of tournaments.rows) {
		const settings = JSON.parse(tournament.settings);

		for (const bracket of settings.bracketProgression) {
			for (const source of bracket.sources ?? []) {
				if (!source.placements.includes(0)) continue;

				const placements = source.placements.filter(
					(placement: number) => placement !== 0,
				);
				source.placements = placements.length > 0 ? placements : [1];
			}
		}

		await sql`
			update "Tournament"
			set "settings" = ${JSON.stringify(settings)}
			where "id" = ${tournament.id}
		`.execute(db);
	}
}
