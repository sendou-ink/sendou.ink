import { db, sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { syncXPBadges } from "../badges/queries/syncXPBadges.server";

const removeOldLikesStm = sql.prepare(/*sql*/ `
  delete from 
    "GroupLike"
    where 
      "GroupLike"."createdAt" < cast(strftime('%s', datetime('now', 'start of day', '-7 days')) as int)
`);

const removeOldGroupStm = sql.prepare(/*sql*/ `
  delete from
    "Group"
  where "Group"."id" in (
    select "Group"."id"
    from "Group"
    left join "GroupMatch" on "Group"."id" = "GroupMatch"."alphaGroupId" or "Group"."id" = "GroupMatch"."bravoGroupId"
      where "Group"."status" = 'INACTIVE'
        and "GroupMatch"."id" is null
  )
`);

const cleanUpStm = sql.prepare(/*sql*/ `
  vacuum
`);

export const cleanUp = () => {
	removeOldLikesStm.run();
	removeOldGroupStm.run();
	cleanUpStm.run();
};

export function migrate(args: { newUserId: number; oldUserId: number }) {
	return db.transaction().execute(async (trx) => {
		// delete some limited data from the target user
		// idea is to make the migration a bit more smooth
		// since it won't fail if some small thing has been added
		// but for bigger things (e.g. has played tournaments)
		// it will still fail
		await trx
			.deleteFrom("UserWeapon")
			.where("userId", "=", args.newUserId)
			.execute();
		await trx
			.deleteFrom("UserFriendCode")
			.where("userId", "=", args.newUserId)
			.execute();
		await trx
			.updateTable("GroupMember")
			.where("userId", "=", args.newUserId)
			.set({ userId: args.oldUserId })
			.execute();

		const deletedUser = await trx
			.deleteFrom("User")
			.where("User.id", "=", args.newUserId)
			.returning("discordId")
			.executeTakeFirstOrThrow();

		await trx
			.updateTable("User")
			.set({ discordId: deletedUser.discordId })
			.where("User.id", "=", args.oldUserId)
			.execute();
	});
}

export function replacePlusTiers(
	plusTiers: Array<{ userId: number; tier: number }>,
) {
	invariant(plusTiers.length > 0, "plusTiers must not be empty");

	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("PlusTier").execute();
		await trx.insertInto("PlusTier").values(plusTiers).execute();
	});
}

export function allPlusTiersFromLatestVoting() {
	return db
		.selectFrom("FreshPlusTier")
		.select(["FreshPlusTier.userId", "FreshPlusTier.tier"])
		.where("FreshPlusTier.tier", "is not", null)
		.execute() as Promise<{ userId: number; tier: number }[]>;
}

export function makeVideoAdderByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isVideoAdder: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export function makeTournamentOrganizerByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isTournamentOrganizer: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export async function linkUserAndPlayer({
	userId,
	playerId,
}: {
	userId: number;
	playerId: number;
}) {
	await db
		.updateTable("SplatoonPlayer")
		.set({ userId: null })
		.where("SplatoonPlayer.userId", "=", userId)
		.execute();

	await db
		.updateTable("SplatoonPlayer")
		.set({ userId })
		.where("SplatoonPlayer.id", "=", playerId)
		.execute();

	syncXPBadges();
}

export function forcePatron(args: {
	id: number;
	patronTier: Tables["User"]["patronTier"];
	patronSince: Date;
	patronTill: Date;
}) {
	return db
		.updateTable("User")
		.set({
			patronTier: args.patronTier,
			patronSince: dateToDatabaseTimestamp(args.patronSince),
			patronTill: dateToDatabaseTimestamp(args.patronTill),
		})
		.where("User.id", "=", args.id)
		.execute();
}

export function banUser({
	userId,
	banned,
	bannedReason,
}: {
	userId: number;
	banned: 1 | Date;
	bannedReason: string | null;
}) {
	return db
		.updateTable("User")
		.set({
			banned: banned === 1 ? banned : dateToDatabaseTimestamp(banned),
			bannedReason,
		})
		.where("User.id", "=", userId)
		.execute();
}

export function unbanUser(userId: number) {
	return db
		.updateTable("User")
		.set({ banned: 0 })
		.where("User.id", "=", userId)
		.execute();
}
