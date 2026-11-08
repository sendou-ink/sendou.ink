import type { ExpressionBuilder, NotNull } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { sortBadgesByFavorites } from "~/features/user-page/core/badge-sorting.server";
import { invariant } from "~/utils/invariant";
import {
	commonUserSelect,
	jsonArrayFrom,
	jsonObjectFrom,
	peakXpOverallSql,
} from "~/utils/kysely.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";
import { findSplatoon3XpBadgeValue } from "./badges-utils";

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
			.select((userEb) => commonUserSelect(userEb))
			.whereRef("User.id", "=", "Badge.authorId"),
	).as("author");
};

const withManagers = (eb: ExpressionBuilder<DB, "Badge">) => {
	return jsonArrayFrom(
		eb
			.selectFrom("BadgeManager")
			.innerJoin("User", "BadgeManager.userId", "User.id")
			.select((managerEb) => ["userId", ...commonUserSelect(managerEb)])
			.whereRef("BadgeManager.badgeId", "=", "Badge.id"),
	).as("managers");
};

// a constant badgeId (not correlated to "Badge"."id") lets SQLite push the predicate into both arms of the BadgeOwner view
const withOwners = (eb: ExpressionBuilder<DB, "Badge">, badgeId: number) => {
	return jsonArrayFrom(
		eb
			.selectFrom("BadgeOwner")
			.innerJoin("User", "BadgeOwner.userId", "User.id")
			.select(({ fn }) => [
				fn.sum<number>("BadgeOwner.count").as("count"),
				"User.id",
				"User.username",
			])
			.where("BadgeOwner.badgeId", "=", badgeId)
			.groupBy("User.id")
			.orderBy("count", "desc"),
	).as("owners");
};

/** Adds a badge. `authorId` is who made it, `null` for a legacy badge. */
export function insert(
	args: Pick<
		TablesInsertable["Badge"],
		"code" | "displayName" | "hue" | "authorId"
	>,
) {
	return db
		.insertInto("Badge")
		.values(args)
		.returning("id")
		.executeTakeFirstOrThrow();
}

export async function findAll() {
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
			withOwners(eb, badgeId),
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

/**
 * Takes a constant userId on purpose: correlating to an outer "User"."id" would stop SQLite
 * pushing the predicate into both arms of the BadgeOwner view, materializing the full view.
 */
export async function findByOwnerUserId(
	userId: number,
	favoriteBadgeIds: number[],
) {
	const rows = await db
		.selectFrom("BadgeOwner")
		.innerJoin("Badge", "Badge.id", "BadgeOwner.badgeId")
		.innerJoin("User", "User.id", "BadgeOwner.userId")
		.select(({ fn }) => [
			fn.sum<number>("BadgeOwner.count").as("count"),
			"Badge.id",
			"Badge.displayName",
			"Badge.code",
			"Badge.hue",
			"User.patronTier",
		])
		.where("BadgeOwner.userId", "=", userId)
		.groupBy("BadgeOwner.badgeId")
		.execute();

	if (rows.length === 0) return [];

	return sortBadgesByFavorites({
		favoriteBadgeIds,
		badges: rows.map(({ patronTier: _, ...badge }) => badge),
		patronTier: rows[0].patronTier,
	});
}

export function findByAuthorUserId(userId: number) {
	return db
		.selectFrom("Badge")
		.select(["Badge.id", "Badge.displayName", "Badge.code", "Badge.hue"])
		.where("Badge.authorId", "=", userId)
		.groupBy("Badge.id")
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

		await trx
			.insertInto("BadgeManager")
			.values(
				managerIds.map((userId) => ({
					badgeId,
					userId,
				})),
			)
			.execute();
	});
}

/**
 * Sets who owns the badge and how many times, one `ownerIds` entry per copy. Copies won at a
 * tournament keep their tournament link: a user's tournament wins count first towards their new
 * total and the rest is a manual grant. Lowering a total below the user's wins removes the most
 * recent ones.
 */
export function replaceOwners({
	badgeId,
	ownerIds,
}: {
	badgeId: number;
	ownerIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		const newCounts = new Map<number, number>();
		for (const userId of ownerIds) {
			newCounts.set(userId, (newCounts.get(userId) ?? 0) + 1);
		}

		const tournamentWins = await trx
			.selectFrom("TournamentBadgeOwner")
			.select(["userId", "tournamentId"])
			.where("badgeId", "=", badgeId)
			.where("tournamentId", "is not", null)
			.$narrowType<{ tournamentId: NotNull }>()
			.orderBy("tournamentId", "asc")
			.execute();

		const keptWinCounts = new Map<number, number>();
		const removedWins: typeof tournamentWins = [];
		for (const win of tournamentWins) {
			const keptCount = keptWinCounts.get(win.userId) ?? 0;
			if (keptCount < (newCounts.get(win.userId) ?? 0)) {
				keptWinCounts.set(win.userId, keptCount + 1);
			} else {
				removedWins.push(win);
			}
		}

		await trx
			.deleteFrom("TournamentBadgeOwner")
			.where("badgeId", "=", badgeId)
			.where("tournamentId", "is", null)
			.execute();

		for (const win of removedWins) {
			await trx
				.deleteFrom("TournamentBadgeOwner")
				.where("badgeId", "=", badgeId)
				.where("userId", "=", win.userId)
				.where("tournamentId", "=", win.tournamentId)
				.execute();
		}

		const manualGrants = Array.from(newCounts, ([userId, count]) => ({
			badgeId,
			userId,
			count: count - (keptWinCounts.get(userId) ?? 0),
		})).filter((grant) => grant.count > 0);

		if (manualGrants.length > 0) {
			await trx
				.insertInto("TournamentBadgeOwner")
				.values(manualGrants)
				.execute();
		}
	});
}

export async function syncXPBadges() {
	return db.transaction().execute(async (trx) => {
		const badgeIdByValue = new Map<number, number>();
		for (const value of SPLATOON_3_XP_BADGE_VALUES) {
			const badge = await trx
				.selectFrom("Badge")
				.select("id")
				.where("code", "=", String(value))
				.executeTakeFirst();

			invariant(badge, `Badge ${value} not found`);

			badgeIdByValue.set(value, badge.id);
		}

		await trx
			.deleteFrom("TournamentBadgeOwner")
			.where("badgeId", "in", [...badgeIdByValue.values()])
			.execute();

		const userTopXPowers = await trx
			.selectFrom("SplatoonPlayer")
			.select(["userId", peakXpOverallSql().as("peakXp")])
			.where("userId", "is not", null)
			.where("peakXp", "is not", null)
			.$narrowType<{ userId: NotNull; peakXp: NotNull }>()
			.execute();

		const badgeOwners = userTopXPowers.flatMap(({ userId, peakXp }) => {
			const badgeValue = findSplatoon3XpBadgeValue(peakXp!);
			const badgeId = badgeValue ? badgeIdByValue.get(badgeValue) : undefined;

			return badgeId ? [{ badgeId, userId }] : [];
		});

		await trx.insertInto("TournamentBadgeOwner").values(badgeOwners).execute();
	});
}
