import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

export async function all() {
	const rows = await db
		.selectFrom("Badge")
		.select(({ eb }) => [
			"id",
			"displayName",
			"code",
			"hue",
			jsonArrayFrom(
				eb
					.selectFrom("BadgeManager")
					.whereRef("BadgeManager.badgeId", "=", "Badge.id")
					.select(["userId"]),
			).as("managers"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select(COMMON_USER_FIELDS)
					.whereRef("User.id", "=", "Badge.authorId"),
			).as("author"),
		])
		.execute();

	return rows.map((row) => ({
		...row,
		managers: row.managers.map((m) => m.userId),
	}));
}

export async function findByOwnerId({
	userId,
	favoriteBadgeId,
}: {
	userId: number;
	favoriteBadgeId: number | null;
}) {
	const badges = await db
		.selectFrom("BadgeOwner")
		.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
		.select(({ fn }) => [
			fn.count<number>("BadgeOwner.badgeId").as("count"),
			"Badge.id",
			"Badge.displayName",
			"Badge.code",
			"Badge.hue",
		])
		.where("BadgeOwner.userId", "=", userId)
		.groupBy(["BadgeOwner.badgeId", "BadgeOwner.userId"])
		.orderBy("Badge.id", "asc")
		.execute();

	if (!favoriteBadgeId) {
		return badges;
	}

	return badges.sort((a, b) => {
		if (a.id === favoriteBadgeId) {
			return -1;
		}
		if (b.id === favoriteBadgeId) {
			return 1;
		}
		return 0;
	});
}

export function findByManagersList(userIds: number[]) {
	return db
		.selectFrom("Badge")
		.select(["Badge.id", "Badge.code", "Badge.displayName", "Badge.hue"])
		.innerJoin("BadgeManager", "Badge.id", "BadgeManager.badgeId")
		.where("BadgeManager.userId", "in", userIds)
		.orderBy("Badge.id asc")
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

export function findManagersByBadgeId(badgeId: number) {
	return db
		.selectFrom("BadgeManager")
		.innerJoin("User", "BadgeManager.userId", "User.id")
		.select(COMMON_USER_FIELDS)
		.where("BadgeManager.badgeId", "=", badgeId)
		.execute();
}

export type FindOwnersByBadgeIdItem = Unwrapped<typeof findOwnersByBadgeId>;
export function findOwnersByBadgeId(badgeId: number) {
	return db
		.selectFrom("BadgeOwner")
		.innerJoin("User", "BadgeOwner.userId", "User.id")
		.select(({ fn }) => [
			fn.count<number>("BadgeOwner.badgeId").as("count"),
			"User.id",
			"User.discordId",
			"User.username",
		])
		.where("BadgeOwner.badgeId", "=", badgeId)
		.groupBy("User.id")
		.orderBy("count", "desc")
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
