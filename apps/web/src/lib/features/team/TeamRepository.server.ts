import type { Transaction } from "kysely";
import { db } from "#lib/server/db/sql.ts";
import type { DB } from "#lib/server/db/tables.ts";
import { commonUserSelect, jsonArrayFrom } from "#lib/server/kysely.ts";

export async function findAllByMemberUserId(
	userId: number,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.select((eb) => [
			"TeamMemberWithSecondary.teamId as id",
			"Team.name",
			"TeamMemberWithSecondary.isOwner",
			"TeamMemberWithSecondary.isMainTeam",
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary as m2")
					.innerJoin("User", "User.id", "m2.userId")
					.select((eb) => [...commonUserSelect(eb), "m2.role", "m2.roleType"])
					.whereRef("TeamMemberWithSecondary.teamId", "=", "m2.teamId")
					.orderBy("m2.order", "asc"),
			).as("members"),
		])
		.where("userId", "=", userId)
		.execute();
}
