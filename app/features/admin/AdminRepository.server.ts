import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";

/**
 * For a user switching Discord accounts: moves the new account's data onto the old user and deletes
 * the new one. Resolves to `null` on success, or an error message if validation fails.
 */
export function migrate(args: { newUserId: number; oldUserId: number }) {
	return db.transaction().execute(async (trx) => {
		const error = await validateMigration(trx, args);
		if (error) {
			return error;
		}

		// small data on the new account is dropped so it doesn't block the migration;
		// bigger things (e.g. played tournaments) still fail validation
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

		// reports between the two merged accounts would become self-reports
		await trx
			.deleteFrom("UserReport")
			.where((eb) =>
				eb.or([
					eb.and([
						eb("reporterUserId", "=", args.newUserId),
						eb("reportedUserId", "=", args.oldUserId),
					]),
					eb.and([
						eb("reporterUserId", "=", args.oldUserId),
						eb("reportedUserId", "=", args.newUserId),
					]),
				]),
			)
			.execute();
		await deleteOlderCollidingUserReports(trx, args, "reporterUserId");
		await deleteOlderCollidingUserReports(trx, args, "reportedUserId");
		await trx
			.updateTable("UserReport")
			.where("reporterUserId", "=", args.newUserId)
			.set({ reporterUserId: args.oldUserId })
			.execute();
		await trx
			.updateTable("UserReport")
			.where("reportedUserId", "=", args.newUserId)
			.set({ reportedUserId: args.oldUserId })
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

		// if both accounts own the same trophy, drop the migrated account's duplicate rows
		await trx
			.deleteFrom("TrophyOwner")
			.where("userId", "=", args.newUserId)
			.where((eb) =>
				eb.exists(
					eb
						.selectFrom("TrophyOwner as existing")
						.select("existing.trophyId")
						.where("existing.userId", "=", args.oldUserId)
						.whereRef("existing.trophyId", "=", "TrophyOwner.trophyId")
						.whereRef("existing.tournamentId", "=", "TrophyOwner.tournamentId"),
				),
			)
			.execute();
		await trx
			.deleteFrom("SpecialTrophyOwner")
			.where("userId", "=", args.newUserId)
			.where((eb) =>
				eb(
					"SpecialTrophyOwner.trophyId",
					"in",
					eb
						.selectFrom("SpecialTrophyOwner")
						.select("trophyId")
						.where("userId", "=", args.oldUserId),
				),
			)
			.execute();
		await trx
			.deleteFrom("PendingTrophyApproval")
			.where("userId", "=", args.newUserId)
			.where((eb) =>
				eb(
					"PendingTrophyApproval.pendingTrophyId",
					"in",
					eb
						.selectFrom("PendingTrophyApproval")
						.select("pendingTrophyId")
						.where("userId", "=", args.oldUserId),
				),
			)
			.execute();

		await trx
			.updateTable("TrophyOwner")
			.where("userId", "=", args.newUserId)
			.set({ userId: args.oldUserId })
			.execute();
		await trx
			.updateTable("SpecialTrophyOwner")
			.where("userId", "=", args.newUserId)
			.set({ userId: args.oldUserId })
			.execute();
		await trx
			.updateTable("Trophy")
			.where("creatorId", "=", args.newUserId)
			.set({ creatorId: args.oldUserId })
			.execute();
		await trx
			.updateTable("Trophy")
			.where("managerId", "=", args.newUserId)
			.set({ managerId: args.oldUserId })
			.execute();
		await trx
			.updateTable("PendingTrophy")
			.where("submitterUserId", "=", args.newUserId)
			.set({ submitterUserId: args.oldUserId })
			.execute();
		await trx
			.updateTable("PendingTrophy")
			.where("managerId", "=", args.newUserId)
			.set({ managerId: args.oldUserId })
			.execute();
		await trx
			.updateTable("PendingTrophy")
			.where("declinedByUserId", "=", args.newUserId)
			.set({ declinedByUserId: args.oldUserId })
			.execute();
		await trx
			.updateTable("PendingTrophyApproval")
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

/** Merging can collide on the one-report-per-pair unique index; the newer report (createdAt, then id) wins. */
function deleteOlderCollidingUserReports(
	trx: Transaction<DB>,
	args: { newUserId: number; oldUserId: number },
	column: "reporterUserId" | "reportedUserId",
) {
	const otherColumn =
		column === "reporterUserId" ? "reportedUserId" : "reporterUserId";

	return trx
		.deleteFrom("UserReport")
		.where(column, "in", [args.newUserId, args.oldUserId])
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("UserReport as newer")
					.select("newer.id")
					.where(`newer.${column}`, "in", [args.newUserId, args.oldUserId])
					.whereRef(`newer.${otherColumn}`, "=", `UserReport.${otherColumn}`)
					.whereRef("newer.id", "!=", "UserReport.id")
					.where((inner) =>
						inner.or([
							inner("newer.createdAt", ">", inner.ref("UserReport.createdAt")),
							inner.and([
								inner(
									"newer.createdAt",
									"=",
									inner.ref("UserReport.createdAt"),
								),
								inner("newer.id", ">", inner.ref("UserReport.id")),
							]),
						]),
					),
			),
		)
		.execute();
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

/** Replaces every `PlusTier` row, also refreshing the build sort values derived from them. */
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

		await BuildRepository.recalculateAllSortValues(undefined, trx);
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

	await BadgeRepository.syncXPBadges();
	await TrophyRepository.syncSpecialTrophies();

	await BuildRepository.recalculateAllSortValues(userId);
	await XRankPlacementRepository.refreshTenStarWeapons(userId);
}

export async function forcePatron(args: {
	id: number;
	patronTier: Tables["User"]["patronTier"];
	patronStartedAt: Date;
	patronExpiresAt: Date;
}) {
	await db
		.updateTable("User")
		.set({
			patronTier: args.patronTier,
			patronStartedAt: dateToDatabaseTimestamp(args.patronStartedAt),
			patronExpiresAt: dateToDatabaseTimestamp(args.patronExpiresAt),
		})
		.where("User.id", "=", args.id)
		.execute();

	await TrophyRepository.syncSpecialTrophies();
}

export async function findAllBannedUsers() {
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
	/** null means an automatic ban. */
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

export function addModNote(
	args: Omit<TablesInsertable["ModNote"], "authorId">,
) {
	return db
		.insertInto("ModNote")
		.values({ ...args, authorId: actorId() })
		.execute();
}

export function findModNoteById(id: number) {
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
