import type { Kysely } from "kysely";

/**
 * The single elimination third place match toggle moves into skipped rounds. Elimination brackets
 * left with a stale `groupCount` (or `teamsPerGroup`) from an earlier format lose it, as `groupCount` now means a grouped bracket.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		const tournaments = await trx
			.selectFrom("Tournament")
			.select(["id", "settings"])
			.where((eb) =>
				eb.or([
					eb("settings", "like", "%thirdPlaceMatch%"),
					eb("settings", "like", "%teamsPerGroup%"),
					eb("settings", "like", "%groupCount%"),
				]),
			)
			.execute();

		for (const tournament of tournaments) {
			const settings = JSON.parse(tournament.settings);
			if (!Array.isArray(settings.bracketProgression)) continue;

			let changed = false;
			for (const bracket of settings.bracketProgression) {
				const bracketSettings = bracket.settings;
				if (!bracketSettings) continue;

				const isElimination =
					bracket.type === "single_elimination" ||
					bracket.type === "double_elimination";

				for (const key of ["groupCount", "teamsPerGroup"]) {
					if (isElimination && key in bracketSettings) {
						delete bracketSettings[key];
						changed = true;
					}
				}

				if ("thirdPlaceMatch" in bracketSettings) {
					if (
						bracket.type === "single_elimination" &&
						bracketSettings.thirdPlaceMatch === false
					) {
						bracketSettings.skippedRounds = ["THIRD_PLACE_MATCH"];
					}
					delete bracketSettings.thirdPlaceMatch;
					changed = true;
				}
			}

			if (!changed) continue;

			await trx
				.updateTable("Tournament")
				.set({ settings: JSON.stringify(settings) })
				.where("id", "=", tournament.id)
				.execute();
		}
	});
}
