import type { Transaction } from "kysely";
import { db, sql } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
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

/**
 * Migrates user-related data. Takes data from the "old user" and remaps it to the Discord ID of the "new user". Used when user switches their Discord accounts.
 *
 * @param args - An object containing:
 *   - `newUserId`: The ID of the user whose data will be migrated and then deleted.
 *   - `oldUserId`: The ID of the user who will receive the migrated data.
 * @returns A promise that resolves to `null` if the migration succeeds, or an error message if validation fails.
 */
export function migrate(args: { newUserId: number; oldUserId: number }) {
	return db.transaction().execute(async (trx) => {
		const error = await validateMigration(trx, args);
		if (error) {
			return error;
		}

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
			.deleteFrom("Build")
			.where("ownerId", "=", args.newUserId)
			.execute();
		await trx
			.deleteFrom("UserFriendCode")
			.where("userId", "=", args.newUserId)
			.execute();
		await trx
			.deleteFrom("LFGPost")
			.where("authorId", "=", args.newUserId)
			.execute();
		await trx
			.deleteFrom("BanLog")
			.where("userId", "=", args.newUserId)
			.execute();

		await trx
			.updateTable("GroupMember")
			.where("userId", "=", args.newUserId)
			.set({ userId: args.oldUserId })
			.execute();
		await trx
			.updateTable("UnvalidatedUserSubmittedImage")
			.where("submitterUserId", "=", args.newUserId)
			.set({ submitterUserId: args.oldUserId })
			.execute();
		await trx
			.updateTable("ModNote")
			.where("userId", "=", args.newUserId)
			.set({ userId: args.oldUserId })
			.execute();

		// special case: delete same team membership to avoid unique constraint violation
		await trx
			.deleteFrom("AllTeamMember")
			.where("userId", "=", args.oldUserId)
			.where("leftAt", "is not", null)
			.where((eb) =>
				eb(
					"AllTeamMember.teamId",
					"in",
					eb
						.selectFrom("AllTeamMember")
						.select("teamId")
						.where("userId", "=", args.newUserId)
						.where("leftAt", "is", null),
				),
			)
			.execute();

		// delete past team membership data (not user visible)
		await trx
			.deleteFrom("AllTeamMember")
			.where("userId", "=", args.newUserId)
			.where("leftAt", "is not", null)
			.execute();
		// existing team membership will stay
		await trx
			.updateTable("AllTeamMember")
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

		return null;
	});
}

async function validateMigration(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
) {
	const newUserTeam = await trx
		.selectFrom("TournamentTeamMember")
		.select(["tournamentTeamId"])
		.where("userId", "=", args.newUserId)
		.executeTakeFirst();

	if (newUserTeam) {
		return "new user is in a tournament team";
	}

	const oldUserCurrentTeam = await trx
		.selectFrom("TeamMember")
		.select(["teamId"])
		.where("userId", "=", args.oldUserId)
		.executeTakeFirst();

	const newUserCurrentTeam = await trx
		.selectFrom("TeamMember")
		.select(["teamId"])
		.where("userId", "=", args.newUserId)
		.executeTakeFirst();

	if (oldUserCurrentTeam && newUserCurrentTeam) {
		return "both old and new user are in teams";
	}

	return null;
}

export function replacePlusTiers(
	plusTiers: Array<{ userId: number; plusTier: number }>,
) {
	invariant(plusTiers.length > 0, "plusTiers must not be empty");

	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("PlusTier").execute();
		await trx
			.insertInto("PlusTier")
			.values(
				plusTiers.map(({ plusTier, userId }) => ({ userId, tier: plusTier })),
			)
			.execute();
	});
}

export function makeVideoAdderByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isVideoAdder: 1 })
		.where("User.id", "=", userId)
		.execute();
}

export function makeArtistByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isArtist: 1 })
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

export function makeApiAccesserByUserId(userId: number) {
	return db
		.updateTable("User")
		.set({ isApiAccesser: 1 })
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
	await BuildRepository.recalculateAllTop500();
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

export async function allBannedUsers() {
	const rows = await db
		.selectFrom("User")
		.select(["User.id as userId", "User.banned", "User.bannedReason"])
		.where("User.banned", "!=", 0)
		.execute();

	const result: Map<number, (typeof rows)[number]> = new Map();

	for (const row of rows) {
		result.set(row.userId, row);
	}

	return result;
}

export function banUser({
	userId,
	banned,
	bannedReason,
	bannedByUserId,
}: {
	userId: number;
	banned: 1 | Date;
	bannedReason: string | null;
	/** Which user banned the user? If null then it means it was an automatic ban. */
	bannedByUserId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		const banArgs = {
			banned: banned === 1 ? banned : dateToDatabaseTimestamp(banned),
			bannedReason,
		};

		await trx
			.updateTable("User")
			.set(banArgs)
			.where("User.id", "=", userId)
			.execute();

		if (typeof bannedByUserId === "number") {
			await trx
				.insertInto("BanLog")
				.values({
					...banArgs,
					userId,
					bannedByUserId,
				})
				.execute();
		}
	});
}

export function unbanUser({
	userId,
	unbannedByUserId,
}: {
	userId: number;
	unbannedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const banArgs = {
			banned: 0,
			bannedReason: null,
		};

		await trx
			.updateTable("User")
			.set(banArgs)
			.where("User.id", "=", userId)
			.execute();

		await trx
			.insertInto("BanLog")
			.values({
				...banArgs,
				userId,
				bannedByUserId: unbannedByUserId,
			})
			.execute();
	});
}

export function addModNote(args: TablesInsertable["ModNote"]) {
	return db.insertInto("ModNote").values(args).execute();
}

export function findModeNoteById(id: number) {
	return db
		.selectFrom("ModNote")
		.selectAll()
		.where("ModNote.id", "=", id)
		.executeTakeFirst();
}

export function deleteModNote(id: number) {
	return db
		.updateTable("ModNote")
		.set({ isDeleted: 1 })
		.where("ModNote.id", "=", id)
		.execute();
}
