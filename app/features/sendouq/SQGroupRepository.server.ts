import { sub } from "date-fns";
import { type NotNull, sql, type Transaction } from "kysely";
import { jsonArrayFrom, jsonBuildObject } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB, Tables, UserMapModePreferences } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	COMMON_USER_FIELDS,
	userChatNameColorForJson,
} from "~/utils/kysely.server";
import { userIsBanned } from "../ban/core/banned.server";
import { FULL_GROUP_SIZE } from "./q-constants";

// xxx: rename to SQGroupRepository

export function mapModePreferencesByGroupId(groupId: number) {
	return db
		.selectFrom("GroupMember")
		.innerJoin("User", "User.id", "GroupMember.userId")
		.select(["User.id as userId", "User.mapModePreferences as preferences"])
		.where("GroupMember.groupId", "=", groupId)
		.where("User.mapModePreferences", "is not", null)
		.$narrowType<{ preferences: NotNull }>()
		.execute();
}

export async function findCurrentGroups() {
	type SendouQMemberObject = {
		id: Tables["User"]["id"];
		username: Tables["User"]["username"];
		discordId: Tables["User"]["discordId"];
		discordAvatar: Tables["User"]["discordAvatar"];
		customUrl: Tables["User"]["customUrl"];
		mapModePreferences: Tables["User"]["mapModePreferences"];
		noScreen: Tables["User"]["noScreen"];
		languages: Tables["User"]["languages"];
		vc: Tables["User"]["vc"];
		role: Tables["GroupMember"]["role"];
		weapons: Tables["User"]["qWeaponPool"];
		chatNameColor: string | null;
		plusTier: Tables["PlusTier"]["tier"] | null;
	};

	return db
		.selectFrom("Group")
		.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
		.innerJoin("User", "User.id", "GroupMember.userId")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.leftJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.select(({ fn, eb }) => [
			"Group.id",
			"Group.chatCode",
			"Group.inviteCode",
			"Group.latestActionAt",
			"Group.chatCode",
			"Group.inviteCode",
			"Group.status",
			"GroupMatch.id as matchId",
			fn
				.agg("json_group_array", [
					jsonBuildObject({
						id: eb.ref("User.id"),
						username: eb.ref("User.username"),
						discordId: eb.ref("User.discordId"),
						discordAvatar: eb.ref("User.discordAvatar"),
						customUrl: eb.ref("User.customUrl"),
						mapModePreferences: eb.ref("User.mapModePreferences"),
						noScreen: eb.ref("User.noScreen"),
						role: eb.ref("GroupMember.role"),
						weapons: eb.ref("User.qWeaponPool"),
						languages: eb.ref("User.languages"),
						plusTier: eb.ref("PlusTier.tier"),
						vc: eb.ref("User.vc"),
						chatNameColor: userChatNameColorForJson,
					}),
				])
				.$castTo<SendouQMemberObject[]>()
				.as("members"),
		])
		.where((eb) =>
			eb.or([
				eb("Group.status", "=", "ACTIVE"),
				eb("Group.status", "=", "PREPARING"),
			]),
		)
		.groupBy("Group.id")
		.execute();
}

export async function findActiveGroupMembers() {
	return db
		.selectFrom("GroupMember")
		.innerJoin("Group", "Group.id", "GroupMember.groupId")
		.select("GroupMember.userId")
		.where("Group.status", "!=", "INACTIVE")
		.execute();
}

type CreateGroupArgs = {
	status: Exclude<Tables["Group"]["status"], "INACTIVE">;
	userId: number;
};
export function createGroup(args: CreateGroupArgs) {
	return db.transaction().execute(async (trx) => {
		const createdGroup = await trx
			.insertInto("Group")
			.values({
				inviteCode: shortNanoid(),
				chatCode: shortNanoid(),
				status: args.status,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupMember")
			.values({
				groupId: createdGroup.id,
				userId: args.userId,
				role: "OWNER",
			})
			.execute();

		return createdGroup;
	});
}

type CreateGroupFromPreviousGroupArgs = {
	previousGroupId: number;
	members: {
		id: number;
		role: Tables["GroupMember"]["role"];
	}[];
};
export async function createGroupFromPrevious(
	args: CreateGroupFromPreviousGroupArgs,
) {
	return db.transaction().execute(async (trx) => {
		const createdGroup = await trx
			.insertInto("Group")
			.columns(["teamId", "chatCode", "inviteCode", "status"])
			.expression((eb) =>
				eb
					.selectFrom("Group")
					.select((eb) => [
						"Group.teamId",
						"Group.chatCode",
						eb.val(shortNanoid()).as("inviteCode"),
						eb.val("PREPARING").as("status"),
					])
					.where("Group.id", "=", args.previousGroupId),
			)
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupMember")
			.values(
				args.members.map((member) => ({
					groupId: createdGroup.id,
					userId: member.id,
					role: member.role,
				})),
			)
			.execute();

		if (!(await isGroupCorrect(createdGroup.id, trx))) {
			throw new Error(
				"Group has too many members or member in multiple groups",
			);
		}

		return createdGroup;
	});
}

function deleteLikesByGroupId(groupId: number, trx: Transaction<DB>) {
	return trx
		.deleteFrom("GroupLike")
		.where((eb) =>
			eb.or([
				eb("GroupLike.likerGroupId", "=", groupId),
				eb("GroupLike.targetGroupId", "=", groupId),
			]),
		)
		.execute();
}

export function morphGroups({
	survivingGroupId,
	otherGroupId,
}: {
	survivingGroupId: number;
	otherGroupId: number;
}) {
	return db.transaction().execute(async (trx) => {
		// reset chat code so previous messages are not visible
		await trx
			.updateTable("Group")
			.set({ chatCode: shortNanoid() })
			.where("Group.id", "=", survivingGroupId)
			.execute();

		const otherGroupMembers = await trx
			.selectFrom("GroupMember")
			.select(["GroupMember.userId", "GroupMember.role"])
			.where("GroupMember.groupId", "=", otherGroupId)
			.execute();

		for (const member of otherGroupMembers) {
			const oldRole = otherGroupMembers.find(
				(m) => m.userId === member.userId,
			)?.role;
			invariant(oldRole, "Member lacking a role");

			await trx
				.updateTable("GroupMember")
				.set({
					role:
						oldRole === "OWNER"
							? "MANAGER"
							: oldRole === "MANAGER"
								? "MANAGER"
								: "REGULAR",
					groupId: survivingGroupId,
				})
				.where("GroupMember.groupId", "=", otherGroupId)
				.where("GroupMember.userId", "=", member.userId)
				.execute();
		}

		await deleteLikesByGroupId(survivingGroupId, trx);
		await refreshGroup(survivingGroupId, trx);

		await trx
			.deleteFrom("Group")
			.where("Group.id", "=", otherGroupId)
			.execute();

		if (!(await isGroupCorrect(survivingGroupId, trx))) {
			throw new Error(
				"Group has too many members or member in multiple groups",
			);
		}
	});
}

/** Check that the group has at most FULL_GROUP_SIZE members and each member is only in this group */
async function isGroupCorrect(
	groupId: number,
	trx: Transaction<DB>,
): Promise<boolean> {
	const members = await trx
		.selectFrom("GroupMember")
		.select("GroupMember.userId")
		.where("GroupMember.groupId", "=", groupId)
		.execute();

	if (members.length > FULL_GROUP_SIZE) {
		return false;
	}

	for (const member of members) {
		const otherGroup = await trx
			.selectFrom("GroupMember")
			.innerJoin("Group", "Group.id", "GroupMember.groupId")
			.select(["Group.id"])
			.where("GroupMember.userId", "=", member.userId)
			.where("Group.status", "!=", "INACTIVE")
			.where("GroupMember.groupId", "!=", groupId)
			.executeTakeFirst();

		if (otherGroup) {
			return false;
		}
	}

	return true;
}

export function addMember(
	groupId: number,
	{
		userId,
		role = "REGULAR",
	}: {
		userId: number;
		role?: Tables["GroupMember"]["role"];
	},
) {
	return db.transaction().execute(async (trx) => {
		await trx
			.insertInto("GroupMember")
			.values({
				groupId,
				userId,
				role,
			})
			.execute();

		await deleteLikesByGroupId(groupId, trx);

		if (!(await isGroupCorrect(groupId, trx))) {
			// xxx: how to handle with good error message to user?
			throw new Error(
				"Group has too many members or member in multiple groups",
			);
		}
	});
}

export async function allLikesByGroupId(groupId: number) {
	const rows = await db
		.selectFrom("GroupLike")
		.select([
			"GroupLike.likerGroupId",
			"GroupLike.targetGroupId",
			"GroupLike.isRechallenge",
		])
		.where((eb) =>
			eb.or([
				eb("GroupLike.likerGroupId", "=", groupId),
				eb("GroupLike.targetGroupId", "=", groupId),
			]),
		)
		.execute();

	return {
		given: rows
			.filter((row) => row.likerGroupId === groupId)
			.map((row) => ({
				groupId: row.targetGroupId,
				isRechallenge: row.isRechallenge,
			})),
		received: rows
			.filter((row) => row.targetGroupId === groupId)
			.map((row) => ({
				groupId: row.likerGroupId,
				isRechallenge: row.isRechallenge,
			})),
	};
}

export function rechallenge({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	return db
		.updateTable("GroupLike")
		.set({ isRechallenge: 1 })
		.where("likerGroupId", "=", likerGroupId)
		.where("targetGroupId", "=", targetGroupId)
		.execute();
}

/**
 * Retrieves information about users who have trusted the specified user,
 * including their associated teams and explicit trust relationships. Banned users are excluded.
 */
export async function usersThatTrusted(userId: number) {
	const teams = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.select(["Team.id", "Team.name", "TeamMemberWithSecondary.isMainTeam"])
		.where("userId", "=", userId)
		.execute();

	const rows = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
		.innerJoin("UserFriendCode", "UserFriendCode.userId", "User.id")
		.select([
			...COMMON_USER_FIELDS,
			"User.inGameName",
			"TeamMemberWithSecondary.teamId",
		])
		.where(
			"TeamMemberWithSecondary.teamId",
			"in",
			teams.map((t) => t.id),
		)
		.union((eb) =>
			eb
				.selectFrom("TrustRelationship")
				.innerJoin("User", "User.id", "TrustRelationship.trustGiverUserId")
				.innerJoin("UserFriendCode", "UserFriendCode.userId", "User.id")
				.select([
					...COMMON_USER_FIELDS,
					"User.inGameName",
					sql<any>`null`.as("teamId"),
				])
				.where("TrustRelationship.trustReceiverUserId", "=", userId),
		)
		.execute();

	const rowsWithoutBanned = rows.filter((row) => !userIsBanned(row.id));

	const teamMemberIds = rowsWithoutBanned
		.filter((row) => row.teamId)
		.map((row) => row.id);

	// we want user to show twice if member of two different teams
	// but we don't want a user from the team to show in teamless section
	const deduplicatedRows = rowsWithoutBanned.filter(
		(row) => row.teamId || !teamMemberIds.includes(row.id),
	);

	// done here at not sql just because it was easier to do here ignoring case
	deduplicatedRows.sort((a, b) => a.username.localeCompare(b.username));

	return {
		teams: teams.sort((a, b) => b.isMainTeam - a.isMainTeam),
		trusters: deduplicatedRows,
	};
}

/** Update the timestamp of the trust relationship, delaying its automatic deletion */
export async function refreshTrust({
	trustGiverUserId,
	trustReceiverUserId,
}: {
	trustGiverUserId: number;
	trustReceiverUserId: number;
}) {
	return db
		.updateTable("TrustRelationship")
		.set({ lastUsedAt: databaseTimestampNow() })
		.where("trustGiverUserId", "=", trustGiverUserId)
		.where("trustReceiverUserId", "=", trustReceiverUserId)
		.execute();
}

export async function deleteOldTrust() {
	const twoMonthsAgo = sub(new Date(), { months: 2 });

	return db
		.deleteFrom("TrustRelationship")
		.where("lastUsedAt", "<", dateToDatabaseTimestamp(twoMonthsAgo))
		.executeTakeFirst();
}

export async function setOldGroupsAsInactive() {
	const oneHourAgo = sub(new Date(), { hours: 1 });

	return db.transaction().execute(async (trx) => {
		const groupsToSetInactive = await trx
			.selectFrom("Group")
			.leftJoin("GroupMatch", (join) =>
				join.on((eb) =>
					eb.or([
						eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
						eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
					]),
				),
			)
			.select(["Group.id"])
			.where("status", "!=", "INACTIVE")
			.where("GroupMatch.id", "is", null)
			.where("latestActionAt", "<", dateToDatabaseTimestamp(oneHourAgo))
			.execute();

		return trx
			.updateTable("Group")
			.set({ status: "INACTIVE" })
			.where(
				"Group.id",
				"in",
				groupsToSetInactive.map((g) => g.id),
			)
			.executeTakeFirst();
	});
}

export async function mapModePreferencesBySeasonNth(seasonNth: number) {
	return db
		.selectFrom("Skill")
		.innerJoin("User", "User.id", "Skill.userId")
		.select("User.mapModePreferences")
		.where("Skill.season", "=", seasonNth)
		.where("Skill.userId", "is not", null)
		.where("User.mapModePreferences", "is not", null)
		.groupBy("Skill.userId")
		.$narrowType<{ mapModePreferences: UserMapModePreferences }>()
		.execute();
}

export async function findRecentlyFinishedMatches() {
	const twoHoursAgo = sub(new Date(), { hours: 2 });

	const rows = await db
		.selectFrom("GroupMatch")
		.select((eb) => [
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.whereRef("GroupMember.groupId", "=", "GroupMatch.alphaGroupId"),
			).as("groupAlphaMemberIds"),
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.whereRef("GroupMember.groupId", "=", "GroupMatch.bravoGroupId"),
			).as("groupBravoMemberIds"),
		])
		.where("GroupMatch.reportedAt", "is not", null)
		.where("GroupMatch.reportedAt", ">", dateToDatabaseTimestamp(twoHoursAgo))
		.execute();

	return rows.map((row) => ({
		groupAlphaMemberIds: row.groupAlphaMemberIds.map((m) => m.userId),
		groupBravoMemberIds: row.groupBravoMemberIds.map((m) => m.userId),
	}));
}

// xxx: handle foreign key error
export function addLike({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.insertInto("GroupLike")
			.values({ likerGroupId, targetGroupId })
			.onConflict((oc) =>
				oc.columns(["likerGroupId", "targetGroupId"]).doNothing(),
			)
			.execute();

		await refreshGroup(likerGroupId, trx);
	});
}

// xxx: handle foreign key error
export function deleteLike({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("GroupLike")
			.where("likerGroupId", "=", likerGroupId)
			.where("targetGroupId", "=", targetGroupId)
			.execute();

		await refreshGroup(likerGroupId, trx);
	});
}

export function leaveGroup(userId: number) {
	return db.transaction().execute(async (trx) => {
		const userGroup = await trx
			.selectFrom("GroupMember")
			.innerJoin("Group", "Group.id", "GroupMember.groupId")
			.select(["Group.id", "GroupMember.role"])
			.where("userId", "=", userId)
			.where("Group.status", "!=", "INACTIVE")
			.executeTakeFirstOrThrow();

		await trx
			.deleteFrom("GroupMember")
			.where("userId", "=", userId)
			.where("GroupMember.groupId", "=", userGroup.id)
			.execute();

		const remainingMembers = await trx
			.selectFrom("GroupMember")
			.select(["userId", "role"])
			.where("groupId", "=", userGroup.id)
			.execute();

		if (remainingMembers.length === 0) {
			await trx.deleteFrom("Group").where("id", "=", userGroup.id).execute();
			return;
		}

		if (userGroup.role === "OWNER") {
			const newOwner =
				remainingMembers.find((m) => m.role === "MANAGER") ??
				remainingMembers[0];

			await trx
				.updateTable("GroupMember")
				.set({ role: "OWNER" })
				.where("userId", "=", newOwner.userId)
				.where("groupId", "=", userGroup.id)
				.execute();
		}

		const match = await trx
			.selectFrom("GroupMatch")
			.where((eb) =>
				eb.or([
					eb("alphaGroupId", "=", userGroup.id),
					eb("bravoGroupId", "=", userGroup.id),
				]),
			)
			.executeTakeFirst();

		if (match) {
			throw new Error("Can't leave group when already in a match");
		}
	});
}

export function refreshGroup(groupId: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.updateTable("Group")
		.set({ latestActionAt: databaseTimestampNow() })
		.where("Group.id", "=", groupId)
		.execute();
}

export function updateMemberNote({
	groupId,
	userId,
	value,
}: {
	groupId: number;
	userId: number;
	value: string | null;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMember")
			.set({ note: value })
			.where("groupId", "=", groupId)
			.where("userId", "=", userId)
			.execute();

		await refreshGroup(groupId, trx);
	});
}

export function updateMemberRole({
	userId,
	groupId,
	role,
}: {
	userId: number;
	groupId: number;
	role: Tables["GroupMember"]["role"];
}) {
	if (role === "OWNER") {
		throw new Error("Can't set role to OWNER with this function");
	}

	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMember")
			.set({ role })
			.where("userId", "=", userId)
			.where("groupId", "=", groupId)
			.execute();

		await refreshGroup(groupId, trx);
	});
}

export function setPreparingGroupAsActive(groupId: number) {
	return db
		.updateTable("Group")
		.set({ status: "ACTIVE", latestActionAt: databaseTimestampNow() })
		.where("id", "=", groupId)
		.where("status", "=", "PREPARING")
		.execute();
}
