import type { ExpressionBuilder } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

const addPermissions = <T extends { managers: { userId: number }[] }>(
	row: T,
) => ({
	...row,
	permissions: {
		MANAGE: row.managers.map((m) => m.userId),
	},
});

const withAuthor = (eb: ExpressionBuilder<DB, "Badge">) => {
	return jsonObjectFrom(
		eb
			.selectFrom("User")
			.select(COMMON_USER_FIELDS)
			.whereRef("User.id", "=", "Badge.authorId"),
	).as("author");
};

const withManagers = (eb: ExpressionBuilder<DB, "Badge">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("BadgeManager")
			.innerJoin("User", "BadgeManager.userId", "User.id")
			.select(["userId", ...COMMON_USER_FIELDS])
			.whereRef("BadgeManager.badgeId", "=", "Badge.id"),
	).as("managers");
};

const withOwners = (eb: ExpressionBuilder<DB, "Badge">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("BadgeOwner")
			.innerJoin("User", "BadgeOwner.userId", "User.id")
			.select(({ fn }) => [
				fn.count<number>("BadgeOwner.badgeId").as("count"),
				"User.id",
				"User.discordId",
				"User.username",
			])
			.whereRef("BadgeOwner.badgeId", "=", "Badge.id")
			.groupBy("User.id")
			.orderBy("count", "desc"),
	).as("owners");
};

export async function all() {
	const rows = await db
		.selectFrom("Badge")
		.select(({ eb }) => [
			"id",
			"displayName",
			"code",
			"hue",
			withManagers(eb),
			withAuthor(eb),
		])
		.execute();

	return rows.map(addPermissions);
}

export async function findById(badgeId: number) {
	const row = await db
		.selectFrom("Badge")
		.select((eb) => [
			"Badge.id",
			"Badge.displayName",
			"Badge.code",
			"Badge.hue",
			withAuthor(eb),
			withManagers(eb),
			withOwners(eb),
		])
		.where("id", "=", badgeId)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return addPermissions(row);
}

export function findByManagersList(userIds: number[]) {
	return db
		.selectFrom("Badge")
		.select(["Badge.id", "Badge.code", "Badge.displayName", "Badge.hue"])
		.innerJoin("BadgeManager", "Badge.id", "BadgeManager.badgeId")
		.where("BadgeManager.userId", "in", userIds)
		.orderBy("Badge.id", "asc")
		.groupBy("Badge.id")
		.execute();
}

export function findManagedByUserId(userId: number) {
	return db
		.selectFrom("BadgeManager")
		.innerJoin("Badge", "Badge.id", "BadgeManager.badgeId")
		.select(["Badge.id", "Badge.code", "Badge.displayName", "Badge.hue"])
		.where("BadgeManager.userId", "=", userId)
		.execute();
}

export function replaceManagers({
	badgeId,
	managerIds,
}: {
	badgeId: number;
	managerIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("BadgeManager")
			.where("badgeId", "=", badgeId)
			.execute();

		if (managerIds.length > 0) {
			await trx
				.insertInto("BadgeManager")
				.values(
					managerIds.map((userId) => ({
						badgeId,
						userId,
					})),
				)
				.execute();
		}
	});
}

export function replaceOwners({
	badgeId,
	ownerIds,
}: {
	badgeId: number;
	ownerIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentBadgeOwner")
			.where("badgeId", "=", badgeId)
			.execute();

		if (ownerIds.length > 0) {
			await trx
				.insertInto("TournamentBadgeOwner")
				.values(
					ownerIds.map((userId) => ({
						badgeId,
						userId,
					})),
				)
				.execute();
		}
	});
}
