import type { Kysely } from "kysely";

/** Canceling a SendouQ match now deletes its reported weapons, this clears the ones canceled before that. */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("ReportedWeapon")
			.where(
				"groupMatchId",
				"in",
				trx
					.selectFrom("Skill")
					.select("Skill.groupMatchId")
					.where("Skill.season", "=", -1)
					.where("Skill.groupMatchId", "is not", null),
			)
			.execute();
	});
}
