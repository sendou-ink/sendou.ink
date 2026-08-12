import { sub } from "date-fns";
import * as R from "remeda";
import { db } from "~/db/sql";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import { SCRIM } from "./scrims-constants";

/**
 * Pick-up rosters recently used by the logged in user, newest first.
 */
export function findAllOwnRecent() {
	return db
		.selectFrom("ScrimPickupRoster")
		.select((eb) => [
			"ScrimPickupRoster.id",
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPickupRosterUser")
					.innerJoin("User", "ScrimPickupRosterUser.userId", "User.id")
					.select((innerEb) => commonUserSelect(innerEb))
					.whereRef(
						"ScrimPickupRosterUser.scrimPickupRosterId",
						"=",
						"ScrimPickupRoster.id",
					)
					.orderBy("ScrimPickupRosterUser.userId", "asc"),
			).as("users"),
		])
		.where("ScrimPickupRoster.userId", "=", actorId())
		.orderBy("ScrimPickupRoster.usedAt", "desc")
		.limit(SCRIM.MAX_SAVED_PICKUP_ROSTERS)
		.execute();
}

/**
 * Marks the given roster as the most recently used pick-up of the logged in user.
 * Reuses the existing roster if the same members were already saved and prunes
 * the rosters that fall out of the most recently used ones.
 *
 * @returns id of the roster that was inserted or reused
 */
export function upsertOwn(memberUserIds: number[]) {
	const ownerId = actorId();

	return db.transaction().execute(async (trx) => {
		const existingRosters = await trx
			.selectFrom("ScrimPickupRoster")
			.select((eb) => [
				"ScrimPickupRoster.id",
				jsonArrayFrom(
					eb
						.selectFrom("ScrimPickupRosterUser")
						.select("ScrimPickupRosterUser.userId")
						.whereRef(
							"ScrimPickupRosterUser.scrimPickupRosterId",
							"=",
							"ScrimPickupRoster.id",
						),
				).as("users"),
			])
			.where("ScrimPickupRoster.userId", "=", ownerId)
			.orderBy("ScrimPickupRoster.usedAt", "desc")
			.orderBy("ScrimPickupRoster.id", "desc")
			.execute();

		const sortedMemberUserIds = sortedIds(memberUserIds);
		const identicalRoster = existingRosters.find((roster) =>
			R.isDeepEqual(
				sortedIds(roster.users.map((user) => user.userId)),
				sortedMemberUserIds,
			),
		);

		if (identicalRoster) {
			await trx
				.updateTable("ScrimPickupRoster")
				.set({ usedAt: databaseTimestampNow() })
				.where("ScrimPickupRoster.id", "=", identicalRoster.id)
				.execute();

			return identicalRoster.id;
		}

		const insertedRoster = await trx
			.insertInto("ScrimPickupRoster")
			.values({ userId: ownerId, usedAt: databaseTimestampNow() })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ScrimPickupRosterUser")
			.values(
				memberUserIds.map((userId) => ({
					scrimPickupRosterId: insertedRoster.id,
					userId,
				})),
			)
			.execute();

		const rosterIdsToDelete = existingRosters
			.slice(SCRIM.MAX_SAVED_PICKUP_ROSTERS - 1)
			.map((roster) => roster.id);

		if (rosterIdsToDelete.length > 0) {
			await trx
				.deleteFrom("ScrimPickupRoster")
				.where("ScrimPickupRoster.id", "in", rosterIdsToDelete)
				.execute();
		}

		return insertedRoster.id;
	});
}

/** Deletes pick-up rosters that have not been used within the expiry window. */
export function deleteOld() {
	return db
		.deleteFrom("ScrimPickupRoster")
		.where("ScrimPickupRoster.usedAt", "<", expiryCutoffTimestamp())
		.executeTakeFirst();
}

function sortedIds(ids: number[]) {
	return R.sort(ids, (a, b) => a - b);
}

function expiryCutoffTimestamp() {
	return dateToDatabaseTimestamp(
		sub(new Date(), { months: SCRIM.PICKUP_ROSTER_EXPIRES_IN_MONTHS }),
	);
}
