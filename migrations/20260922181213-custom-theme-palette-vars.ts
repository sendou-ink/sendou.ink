import { type Kysely, sql } from "kysely";

/**
 * Custom themes now store lightness and hue per color slot, the dark mode
 * background lightness and the raw accent chroma. Existing themes get the
 * values they were rendered with until now (fixed lightness, unshifted hue)
 * so they look exactly the same until re-saved. Light mode secondary colors
 * used the dark mode chroma slots, now they have their own.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		for (const table of ["User", "AllTeam"]) {
			await sql`
				update ${sql.table(table)}
				set "customTheme" = json_set(
					"customTheme",
					'$."--_bg-l"', 0.17,
					'$."--_acc-chroma"', json_extract("customTheme", '$."--_acc-c-2"') / 0.34,
					'$."--_acc-l-0"', 0.26,
					'$."--_acc-l-1"', 0.52,
					'$."--_acc-l-2"', 0.83,
					'$."--_acc-l-3"', 0.88,
					'$."--_acc-l-4"', 0.53,
					'$."--_acc-l-5"', 0.32,
					'$."--_acc-l-6"', 0.53,
					'$."--_acc-c-6"', json_extract("customTheme", '$."--_acc-c-4"'),
					'$."--_acc-h-0"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-1"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-2"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-3"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-4"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-5"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-h-6"', json_extract("customTheme", '$."--_acc-h"'),
					'$."--_acc-fill-dark-text"', 0,
					'$."--_second-l-0"', 0.26,
					'$."--_second-l-1"', 0.52,
					'$."--_second-l-2"', 0.83,
					'$."--_second-l-3"', 0.88,
					'$."--_second-l-4"', 0.53,
					'$."--_second-l-5"', 0.32,
					'$."--_second-h-0"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-h-1"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-h-2"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-h-3"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-h-4"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-h-5"', json_extract("customTheme", '$."--_second-h"'),
					'$."--_second-c-3"', json_extract("customTheme", '$."--_second-c-0"'),
					'$."--_second-c-4"', json_extract("customTheme", '$."--_second-c-1"'),
					'$."--_second-c-5"', json_extract("customTheme", '$."--_second-c-2"')
				)
				where "customTheme" is not null
					and json_extract("customTheme", '$."--_bg-l"') is null
			`.execute(trx);
		}
	});
}
