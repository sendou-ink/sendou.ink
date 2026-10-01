import type { NotNull } from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, mapRows, refine } from "~/db/entity-query";
import { db } from "~/db/sql";
import { sortBadgesByFavorites } from "~/features/user-page/core/badge-sorting.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { invariant } from "~/utils/invariant";
import {
	commonUserSelect,
	jsonArrayFrom,
	peakXpOverallSql,
} from "~/utils/kysely.server";
import { SPLATOON_3_XP_BADGE_VALUES } from "./badges-constants";
import { findSplatoon3XpBadgeValue } from "./badges-utils";

const badgeTable = crud("Badge");
const managerTable = crud("BadgeManager");
const ownerTable = crud("TournamentBadgeOwner");

export const { findById, insert } = badgeTable;

/** Badges, in the order they were added. */
export const badges = defineQuery({
	root: "Badge",
	select: (qb) =>
		qb.select(["Badge.id", "Badge.code", "Badge.displayName", "Badge.hue"]),
	defaultSort: [["Badge.id", "asc"]],
	vocabulary: () => ({
		/** Who made the badge, `null` for a legacy badge. */
		withAuthor: () => UserRepository.withUser("author", "Badge.authorId"),
		withManagers: () =>
			refine("Badge", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("BadgeManager")
							.innerJoin("User", "BadgeManager.userId", "User.id")
							.select((managerEb) => [
								"BadgeManager.userId",
								...commonUserSelect(managerEb),
							])
							.whereRef("BadgeManager.badgeId", "=", "Badge.id"),
					).as("managers"),
				),
			),
		/** Badges any of the users manages. */
		managedBy: (userIds: number[]) =>
			refine("Badge", (qb) =>
				qb.where((eb) =>
					eb(
						"Badge.id",
						"in",
						eb
							.selectFrom("BadgeManager")
							.select("BadgeManager.badgeId")
							.where("BadgeManager.userId", "in", userIds),
					),
				),
			),
		/** The badge's managers may manage it. */
		withManagePermissions: () =>
			mapRows("Badge", (row: { managers: Array<{ userId: number }> }) => ({
				permissions: {
					MANAGE: row.managers.map((manager) => manager.userId),
				},
			})),
	}),
});

/** The badge with its author, managers, owners and who may manage it. */
export function badgeDetails(id: number) {
	return badges()
		.where({ id })
		.withAuthor()
		.withManagers()
		.withManagePermissions()
		.with(ownersOf(id));
}

/**
 * The user's badges with how many times they own each, favorites first. Takes a constant userId
 * on purpose: correlating to an outer "User"."id" would stop SQLite pushing the predicate into
 * both arms of the BadgeOwner view, materializing the full view.
 */
export async function findAllByOwnerUserId({
	userId,
	favoriteBadgeIds,
}: {
	userId: number;
	favoriteBadgeIds: number[];
}) {
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

export function replaceManagers({
	badgeId,
	managerIds,
}: {
	badgeId: number;
	managerIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await managerTable.delete({ badgeId }, trx);
		await managerTable.insertMany(
			managerIds.map((userId) => ({ badgeId, userId })),
			trx,
		);
	});
}

/** Replaces the badge's owners, repeating an id for multiple wins. */
export function replaceOwners({
	badgeId,
	ownerIds,
}: {
	badgeId: number;
	ownerIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		await ownerTable.delete({ badgeId }, trx);

		const counts = new Map<number, number>();
		for (const userId of ownerIds) {
			counts.set(userId, (counts.get(userId) ?? 0) + 1);
		}

		await ownerTable.insertMany(
			Array.from(counts, ([userId, count]) => ({ badgeId, userId, count })),
			trx,
		);
	});
}

/** Gives every user with a linked X Rank player the XP badge of their peak power, replacing the previous ones. */
export async function syncXPBadges() {
	return db.transaction().execute(async (trx) => {
		const xpBadges = await trx
			.selectFrom("Badge")
			.select(["Badge.id", "Badge.code"])
			.where("Badge.code", "in", SPLATOON_3_XP_BADGE_VALUES.map(String))
			.execute();

		const badgeIdByValue = new Map<number, number>();
		for (const value of SPLATOON_3_XP_BADGE_VALUES) {
			const badge = xpBadges.find((xpBadge) => xpBadge.code === String(value));
			invariant(badge, `Badge ${value} not found`);

			badgeIdByValue.set(value, badge.id);
		}

		await trx
			.deleteFrom("TournamentBadgeOwner")
			.where("TournamentBadgeOwner.badgeId", "in", [...badgeIdByValue.values()])
			.execute();

		const userTopXPowers = await trx
			.selectFrom("SplatoonPlayer")
			.select(["SplatoonPlayer.userId", peakXpOverallSql().as("peakXp")])
			.where("SplatoonPlayer.userId", "is not", null)
			.where("peakXp", "is not", null)
			.$narrowType<{ userId: NotNull; peakXp: NotNull }>()
			.execute();

		const badgeOwners = userTopXPowers.flatMap(({ userId, peakXp }) => {
			const badgeValue = findSplatoon3XpBadgeValue(peakXp);
			const badgeId = badgeValue ? badgeIdByValue.get(badgeValue) : undefined;

			return badgeId ? [{ badgeId, userId }] : [];
		});

		await ownerTable.insertMany(badgeOwners, trx);
	});
}

// a constant badgeId (not correlated to "Badge"."id") lets SQLite push the predicate into both
// arms of the BadgeOwner view, ~20x faster for a badge with many owners
function ownersOf(badgeId: number) {
	return refine("Badge", (qb) =>
		qb.select((eb) =>
			jsonArrayFrom(
				eb
					.selectFrom("BadgeOwner")
					.innerJoin("User", "BadgeOwner.userId", "User.id")
					.select(({ fn }) => [
						fn.sum<number>("BadgeOwner.count").as("count"),
						"User.id",
						"User.discordId",
						"User.username",
					])
					.where("BadgeOwner.badgeId", "=", badgeId)
					.groupBy("User.id")
					.orderBy("count", "desc"),
			).as("owners"),
		),
	);
}
