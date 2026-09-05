import { addHours, sub } from "date-fns";
import {
	type ExpressionBuilder,
	type NotNull,
	sql,
	type Transaction,
} from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import type { UserMapModePreferences } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import {
	commonUserMembersAgg,
	commonUserSelect,
	jsonArrayFrom,
	matchProfileWeapons,
} from "~/utils/kysely.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { userIsBanned } from "../ban/core/banned.server";
import { FULL_GROUP_SIZE } from "./q-constants";
import { SendouQError } from "./q-utils.server";

const CHAT_ROOM_LIFESPAN_HOURS = 12;

export async function findMapModePreferencesByGroupId(groupId: number) {
	const group = await db
		.selectFrom("Group")
		.leftJoin("AllTeam", "AllTeam.id", "Group.teamId")
		.select([
			"AllTeam.mapModePreferences as teamMapModePreferences",
			"AllTeam.name as teamName",
		])
		.where("Group.id", "=", groupId)
		.executeTakeFirst();

	if (group?.teamMapModePreferences) {
		const members = await db
			.selectFrom("GroupMember")
			.select("GroupMember.userId")
			.where("GroupMember.groupId", "=", groupId)
			.execute();

		return members.map((m) => ({
			userId: m.userId,
			preferences: group.teamMapModePreferences as UserMapModePreferences,
			teamName: group.teamName,
		}));
	}

	return db
		.selectFrom("GroupMember")
		.innerJoin("User", "User.id", "GroupMember.userId")
		.select(["User.id as userId", "User.mapModePreferences as preferences"])
		.where("GroupMember.groupId", "=", groupId)
		.where("User.mapModePreferences", "is not", null)
		.$narrowType<{ preferences: NotNull }>()
		.execute();
}

/** Groups owning the given chat rooms, with their members' user ids. */
export async function findAllByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	return db
		.selectFrom("Group")
		.select((eb) => [
			"Group.chatRoomId",
			"Group.status",
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.whereRef("GroupMember.groupId", "=", "Group.id"),
			).as("members"),
		])
		.where("Group.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

export async function findCurrentGroups() {
	return (
		db
			.selectFrom("Group")
			.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
			.innerJoin("User", "User.id", "GroupMember.userId")
			.leftJoin("AllTeam", "AllTeam.id", "Group.teamId")
			.leftJoin("GroupMatch", (join) =>
				join.on((eb) =>
					eb.or([
						eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
						eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
					]),
				),
			)
			.select(({ eb }) => [
				"Group.id",
				"Group.chatRoomId",
				"Group.inviteCode",
				"Group.latestActionAt",
				"Group.status",
				"AllTeam.mapModePreferences as teamMapModePreferences",
				"GroupMatch.id as matchId",
				commonUserMembersAgg(eb, {
					mapModePreferences: eb.ref("User.mapModePreferences"),
					noScreen: eb.ref("User.noScreen"),
					note: eb.ref("GroupMember.note"),
					weapons: matchProfileWeapons(eb),
					languages: eb.ref("User.languages"),
					vc: eb.ref("User.vc"),
				}).as("members"),
			])
			// != INACTIVE (same set as ACTIVE or PREPARING) so the partial
			// group_status_active index applies
			.where("Group.status", "!=", "INACTIVE")
			.groupBy("Group.id")
			.execute()
	);
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
export async function insert(args: CreateGroupArgs) {
	return db.transaction().execute(async (trx) => {
		const chatRoom = await ChatRepository.insertRoom(
			{
				type: "SQ_GROUP",
				expiresAt: addHours(new Date(), CHAT_ROOM_LIFESPAN_HOURS),
			},
			trx,
		);

		const createdGroup = await trx
			.insertInto("Group")
			.values({
				inviteCode: shortNanoid(),
				chatRoomId: chatRoom.id,
				status: args.status,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupMember")
			.values({
				groupId: createdGroup.id,
				userId: args.userId,
			})
			.execute();

		if (!(await isGroupCorrect(createdGroup.id, trx))) {
			throw new SendouQError("Group has a member in multiple groups");
		}

		const chatRoomIdToRevalidate = await recordImplicitRejoinNoVote(
			args.userId,
			trx,
		);

		return { id: createdGroup.id, chatRoomIdToRevalidate };
	});
}

type CreateGroupFromPreviousGroupArgs = {
	previousGroupId: number;
	memberUserIds: number[];
	status?: Exclude<Tables["Group"]["status"], "INACTIVE">;
};
export async function insertFromPrevious(
	args: CreateGroupFromPreviousGroupArgs,
) {
	const status = args.status ?? "PREPARING";

	return db.transaction().execute(async (trx) => {
		const previousGroup = await trx
			.selectFrom("Group")
			.select(["Group.chatRoomId", "Group.matchmade"])
			.where("Group.id", "=", args.previousGroupId)
			.executeTakeFirstOrThrow();

		// the successor group carries the previous group's chat over; the room's
		// unique owner index requires the previous group to release it first
		let chatRoomId = previousGroup.chatRoomId;
		if (chatRoomId !== null) {
			await trx
				.updateTable("Group")
				.set({ chatRoomId: null })
				.where("Group.id", "=", args.previousGroupId)
				.execute();
			await ChatRepository.updateRoomExpiresAt(
				{
					roomId: chatRoomId,
					expiresAt: addHours(new Date(), CHAT_ROOM_LIFESPAN_HOURS),
				},
				trx,
			);
		} else {
			chatRoomId = (
				await ChatRepository.insertRoom(
					{
						type: "SQ_GROUP",
						expiresAt: addHours(new Date(), CHAT_ROOM_LIFESPAN_HOURS),
					},
					trx,
				)
			).id;
		}

		const createdGroup = await trx
			.insertInto("Group")
			.values({
				chatRoomId,
				inviteCode: shortNanoid(),
				status,
				matchmade: previousGroup.matchmade,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupMember")
			.values(
				args.memberUserIds.map((userId) => ({
					groupId: createdGroup.id,
					userId,
				})),
			)
			.execute();

		await syncTeamId(createdGroup.id, trx);

		if (!(await isGroupCorrect(createdGroup.id, trx))) {
			throw new SendouQError(
				"Group has too many members or member in multiple groups",
			);
		}

		return createdGroup;
	});
}

/** Stamps the group as a team's when a full group's worth of members share one, else clears it. A team's group queues on the team's own map & mode preferences. */
export async function syncTeamId(groupId: number, trx: Transaction<DB>) {
	// the tables are joined directly instead of through `TeamMemberWithSecondary`,
	// which SQLite materializes in full before the group filter narrows it down
	const members = await trx
		.selectFrom("GroupMember")
		.innerJoin("AllTeamMember", (join) =>
			join
				.onRef("AllTeamMember.userId", "=", "GroupMember.userId")
				.on("AllTeamMember.leftAt", "is", null),
		)
		.innerJoin("Team", "Team.id", "AllTeamMember.teamId")
		.select(["AllTeamMember.teamId"])
		.where("GroupMember.groupId", "=", groupId)
		.execute();

	const counts = new Map<number, number>();

	for (const member of members) {
		const newCount = (counts.get(member.teamId) ?? 0) + 1;
		if (newCount === FULL_GROUP_SIZE) {
			await trx
				.updateTable("Group")
				.set({ teamId: member.teamId })
				.where("id", "=", groupId)
				.execute();
			return;
		}

		counts.set(member.teamId, newCount);
	}

	await trx
		.updateTable("Group")
		.set({ teamId: null })
		.where("id", "=", groupId)
		.execute();
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

function deleteSuggestionsByGroupId(groupId: number, trx: Transaction<DB>) {
	return trx
		.deleteFrom("GroupSuggestion")
		.where((eb) =>
			eb.or([
				eb("GroupSuggestion.suggesterGroupId", "=", groupId),
				eb("GroupSuggestion.targetGroupId", "=", groupId),
			]),
		)
		.execute();
}

/** Deletes every like and suggestion with the group on either side, for when they stop being actionable (roster changed, match started). */
export async function deleteLikesAndSuggestionsByGroupId(
	groupId: number,
	trx: Transaction<DB>,
) {
	await deleteLikesByGroupId(groupId, trx);
	await deleteSuggestionsByGroupId(groupId, trx);
}

export function morphGroups({
	survivingGroupId,
	otherGroupId,
}: {
	survivingGroupId: number;
	otherGroupId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const oldChatRooms = await trx
			.selectFrom("Group")
			.select(["Group.chatRoomId"])
			.where("Group.id", "in", [survivingGroupId, otherGroupId])
			.execute();

		// fresh chat room so neither group's previous messages are visible, and
		// mark as matchmade
		const chatRoom = await ChatRepository.insertRoom(
			{
				type: "SQ_GROUP",
				expiresAt: addHours(new Date(), CHAT_ROOM_LIFESPAN_HOURS),
			},
			trx,
		);
		await trx
			.updateTable("Group")
			.set({ chatRoomId: chatRoom.id, matchmade: 1 })
			.where("Group.id", "=", survivingGroupId)
			.execute();

		await trx
			.updateTable("GroupMember")
			.set({ groupId: survivingGroupId })
			.where("GroupMember.groupId", "=", otherGroupId)
			.execute();

		await syncTeamId(survivingGroupId, trx);
		await deleteLikesAndSuggestionsByGroupId(survivingGroupId, trx);
		await refreshGroup(survivingGroupId, trx);

		await ChatRepository.deleteRoomsByIds(
			oldChatRooms.map((room) => room.chatRoomId),
			trx,
		);

		await trx
			.deleteFrom("Group")
			.where("Group.id", "=", otherGroupId)
			.execute();

		if (!(await isGroupCorrect(survivingGroupId, trx))) {
			throw new SendouQError(
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

export async function insertMember(
	groupId: number,
	{ userId }: { userId: number },
) {
	const chatRoomIdToRevalidate = await db.transaction().execute(async (trx) => {
		await trx
			.insertInto("GroupMember")
			.values({
				groupId,
				userId,
			})
			.execute();

		await syncTeamId(groupId, trx);
		await deleteLikesAndSuggestionsByGroupId(groupId, trx);

		if (!(await isGroupCorrect(groupId, trx))) {
			throw new SendouQError(
				"Group has too many members or member in multiple groups",
			);
		}

		return recordImplicitRejoinNoVote(userId, trx);
	});

	return { chatRoomIdToRevalidate };
}

export async function findAllLikesByGroupId(groupId: number) {
	const rows = await db
		.selectFrom("GroupLike")
		.leftJoin("User", "User.id", "GroupLike.createdByUserId")
		.select([
			"GroupLike.likerGroupId",
			"GroupLike.targetGroupId",
			"GroupLike.isRechallenge",
			"User.username as createdByUsername",
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
				createdByUsername: row.createdByUsername,
			})),
		received: rows
			.filter((row) => row.targetGroupId === groupId)
			.map((row) => ({
				groupId: row.likerGroupId,
				isRechallenge: row.isRechallenge,
			})),
	};
}

/** Suggestions the given group's members have made to each other, newest first. */
export async function findAllSuggestionsByGroupId(groupId: number) {
	const rows = await db
		.selectFrom("GroupSuggestion")
		.innerJoin("User", "User.id", "GroupSuggestion.createdByUserId")
		.select([
			"GroupSuggestion.targetGroupId",
			"User.username as createdByUsername",
		])
		.where("GroupSuggestion.suggesterGroupId", "=", groupId)
		.orderBy("GroupSuggestion.createdAt", "desc")
		.execute();

	return rows.map((row) => ({
		groupId: row.targetGroupId,
		createdByUsername: row.createdByUsername,
	}));
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

export async function findFriendsAndTeammates(userId: number) {
	const teams = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.select(["Team.id", "Team.name", "TeamMemberWithSecondary.isMainTeam"])
		.where("userId", "=", userId)
		.execute();

	const rows = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
		.select((eb) => [
			...commonUserSelect(eb),
			"User.inGameName",
			"TeamMemberWithSecondary.teamId",
			"TeamMemberWithSecondary.role",
			"TeamMemberWithSecondary.roleType",
		])
		.where(
			"TeamMemberWithSecondary.teamId",
			"in",
			teams.map((t) => t.id),
		)
		.union((eb) =>
			eb
				.selectFrom("Friendship")
				.innerJoin("User", (join) =>
					join.on((eb) =>
						eb.or([
							eb.and([
								eb("Friendship.userOneId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userTwoId")),
							]),
							eb.and([
								eb("Friendship.userTwoId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userOneId")),
							]),
						]),
					),
				)
				.select((eb) => [
					...commonUserSelect(eb),
					"User.inGameName",
					sql<any>`null`.as("teamId"),
					sql<Tables["TeamMember"]["role"]>`null`.as("role"),
					sql<Tables["TeamMember"]["roleType"]>`null`.as("roleType"),
				]),
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
		friends: deduplicatedRows,
	};
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

		const groupIds = groupsToSetInactive.map((g) => g.id);

		await trx
			.deleteFrom("GroupLike")
			.where((eb) =>
				eb.or([
					eb("GroupLike.likerGroupId", "in", groupIds),
					eb("GroupLike.targetGroupId", "in", groupIds),
				]),
			)
			.execute();

		await trx
			.deleteFrom("GroupSuggestion")
			.where((eb) =>
				eb.or([
					eb("GroupSuggestion.suggesterGroupId", "in", groupIds),
					eb("GroupSuggestion.targetGroupId", "in", groupIds),
				]),
			)
			.execute();

		return trx
			.updateTable("Group")
			.set({ status: "INACTIVE" })
			.where("Group.id", "in", groupIds)
			.executeTakeFirst();
	});
}
export async function closeExpiredContinueVotes() {
	const cutoff = dateToDatabaseTimestamp(sub(new Date(), { hours: 1 }));

	return db.transaction().execute(async (trx) => {
		const eligibleGroups = await trx
			.selectFrom("Group")
			.innerJoin("GroupMatch", (join) =>
				join.on((eb) =>
					eb.or([
						eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
						eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
					]),
				),
			)
			.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
			.leftJoin("GroupMatchContinueVote", (join) =>
				join
					.onRef("GroupMatchContinueVote.groupId", "=", "Group.id")
					.onRef("GroupMatchContinueVote.userId", "=", "GroupMember.userId"),
			)
			.select([
				"Group.id as groupId",
				"GroupMatch.chatRoomId as matchChatRoomId",
			])
			.where("Group.matchmade", "=", 1)
			.where("GroupMatch.confirmedAt", "is not", null)
			.where("GroupMatch.confirmedAt", "<", cutoff)
			.where("GroupMatchContinueVote.id", "is", null)
			.groupBy("Group.id")
			.execute();

		const chatRoomIdsToRevalidate = eligibleGroups
			.map((group) => group.matchChatRoomId)
			.filter((chatRoomId) => chatRoomId !== null);

		if (eligibleGroups.length > 0) {
			const members = await trx
				.selectFrom("GroupMember")
				.select(["GroupMember.groupId", "GroupMember.userId"])
				.where(
					"GroupMember.groupId",
					"in",
					eligibleGroups.map((group) => group.groupId),
				)
				.execute();

			await trx
				.insertInto("GroupMatchContinueVote")
				.values(
					members.map((member) => ({
						groupId: member.groupId,
						userId: member.userId,
						isContinuing: 0 as const,
					})),
				)
				.onConflict((oc) =>
					oc.columns(["groupId", "userId"]).doUpdateSet({ isContinuing: 0 }),
				)
				.execute();
		}

		return {
			chatRoomIdsToRevalidate,
			numAffectedGroups: eligibleGroups.length,
		};
	});
}

export async function findAllMapModePreferencesBySeasonNth(seasonNth: number) {
	return db
		.selectFrom("User")
		.select("User.mapModePreferences")
		.where("User.mapModePreferences", "is not", null)
		.where(({ eb, exists }) =>
			exists(
				eb
					.selectFrom("Skill")
					.select("Skill.id")
					.whereRef("Skill.userId", "=", "User.id")
					.where("Skill.season", "=", seasonNth),
			),
		)
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
		.where("GroupMatch.confirmedAt", "is not", null)
		.where("GroupMatch.confirmedAt", ">", dateToDatabaseTimestamp(twoHoursAgo))
		.execute();

	return rows.map((row) => ({
		groupAlphaMemberIds: row.groupAlphaMemberIds.map((m) => m.userId),
		groupBravoMemberIds: row.groupBravoMemberIds.map((m) => m.userId),
	}));
}

export function insertLike({
	likerGroupId,
	targetGroupId,
	createdByUserId,
}: {
	likerGroupId: number;
	targetGroupId: number;
	createdByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		try {
			await trx
				.insertInto("GroupLike")
				.values({ likerGroupId, targetGroupId, createdByUserId })
				.onConflict((oc) =>
					oc.columns(["likerGroupId", "targetGroupId"]).doNothing(),
				)
				.execute();
		} catch (error) {
			if (errorIsSqliteForeignKeyConstraintFailure(error)) {
				throw new SendouQError(error.message);
			}
			throw error;
		}

		// inviting says everything the suggestion was there to say
		await trx
			.deleteFrom("GroupSuggestion")
			.where("suggesterGroupId", "=", likerGroupId)
			.where("targetGroupId", "=", targetGroupId)
			.execute();

		await refreshGroup(likerGroupId, trx);
	});
}

/** Marks a group as worth a look for the suggester's own teammates. Suggesting twice is a no-op. */
export function insertSuggestion({
	suggesterGroupId,
	targetGroupId,
	createdByUserId,
}: {
	suggesterGroupId: number;
	targetGroupId: number;
	createdByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		try {
			await trx
				.insertInto("GroupSuggestion")
				.values({ suggesterGroupId, targetGroupId, createdByUserId })
				.onConflict((oc) =>
					oc.columns(["suggesterGroupId", "targetGroupId"]).doNothing(),
				)
				.execute();
		} catch (error) {
			if (errorIsSqliteForeignKeyConstraintFailure(error)) {
				throw new SendouQError(error.message);
			}
			throw error;
		}

		await refreshGroup(suggesterGroupId, trx);
	});
}

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

/** Deletes every like where the given group is the liker or the target. */
export function deleteAllLikesByGroupId(groupId: number) {
	return db.transaction().execute((trx) => deleteLikesByGroupId(groupId, trx));
}

/** Removes the user from their group (deleting it if they were last). A ready check the group was in is called off; returns the ids of the groups that were in it. */
export function leaveGroup(userId: number) {
	return db.transaction().execute(async (trx) => {
		const userGroup = await trx
			.selectFrom("GroupMember")
			.innerJoin("Group", "Group.id", "GroupMember.groupId")
			.select(["Group.id", "Group.chatRoomId"])
			.where("userId", "=", userId)
			.where("Group.status", "!=", "INACTIVE")
			.executeTakeFirstOrThrow();

		// the group can no longer field the match it was about to play, so the
		// other group is freed to look again as well
		const readyCheck = await trx
			.selectFrom("GroupReadyCheck")
			.select([
				"GroupReadyCheck.id",
				"GroupReadyCheck.alphaGroupId",
				"GroupReadyCheck.bravoGroupId",
			])
			.where((eb) =>
				eb.or([
					eb("GroupReadyCheck.alphaGroupId", "=", userGroup.id),
					eb("GroupReadyCheck.bravoGroupId", "=", userGroup.id),
				]),
			)
			.executeTakeFirst();

		if (readyCheck) {
			await deleteReadyCheckInTrx(
				{ id: readyCheck.id, markMissedMembers: false },
				trx,
			);
		}

		const abortedReadyCheckGroupIds = readyCheck
			? [readyCheck.alphaGroupId, readyCheck.bravoGroupId]
			: [];

		await trx
			.deleteFrom("GroupMember")
			.where("userId", "=", userId)
			.where("GroupMember.groupId", "=", userGroup.id)
			.execute();

		const remainingMember = await trx
			.selectFrom("GroupMember")
			.select(["userId"])
			.where("groupId", "=", userGroup.id)
			.executeTakeFirst();

		if (!remainingMember) {
			await ChatRepository.deleteRoomsByIds([userGroup.chatRoomId], trx);
			await trx.deleteFrom("Group").where("id", "=", userGroup.id).execute();
			return { abortedReadyCheckGroupIds };
		}

		const match = await trx
			.selectFrom("GroupMatch")
			.select(["GroupMatch.id"])
			.where((eb) =>
				eb.or([
					eb("alphaGroupId", "=", userGroup.id),
					eb("bravoGroupId", "=", userGroup.id),
				]),
			)
			.executeTakeFirst();

		if (match) {
			throw new SendouQError("Can't leave group when already in a match");
		}

		await syncTeamId(userGroup.id, trx);

		return { abortedReadyCheckGroupIds };
	});
}

export function refreshGroup(groupId: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.updateTable("Group")
		.set({ latestActionAt: databaseTimestampNow() })
		.where("Group.id", "=", groupId)
		.execute();
}

export function updateOwnMemberNote({
	groupId,
	value,
}: {
	groupId: number;
	value: string | null;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("GroupMember")
			.set({ note: value })
			.where("groupId", "=", groupId)
			.where("userId", "=", actorId())
			.execute();

		await refreshGroup(groupId, trx);
	});
}

/** User ids of the group's members who let a ready check expire without confirming, and can thus be kicked by the rest of the group. */
export async function findAllMissedReadyCheckUserIdsByGroupId(groupId: number) {
	const rows = await db
		.selectFrom("GroupMember")
		.select("GroupMember.userId")
		.where("GroupMember.groupId", "=", groupId)
		.where("GroupMember.missedReadyCheckAt", "is not", null)
		.execute();

	return rows.map((row) => row.userId);
}

/** The ready check the group is in, with each member of both groups and when (if at all) they confirmed being ready. */
export async function findReadyCheckByGroupId(groupId: number) {
	const readyCheck = await db
		.selectFrom("GroupReadyCheck")
		.select([
			"GroupReadyCheck.id",
			"GroupReadyCheck.alphaGroupId",
			"GroupReadyCheck.bravoGroupId",
			"GroupReadyCheck.createdAt",
		])
		.where((eb) =>
			eb.or([
				eb("GroupReadyCheck.alphaGroupId", "=", groupId),
				eb("GroupReadyCheck.bravoGroupId", "=", groupId),
			]),
		)
		.executeTakeFirst();

	if (!readyCheck) return;

	const members = await db
		.selectFrom("GroupMember")
		.leftJoin("GroupReadyCheckConfirmation", (join) =>
			join
				.onRef("GroupReadyCheckConfirmation.userId", "=", "GroupMember.userId")
				.on("GroupReadyCheckConfirmation.readyCheckId", "=", readyCheck.id),
		)
		.select([
			"GroupMember.userId",
			"GroupMember.groupId",
			"GroupReadyCheckConfirmation.createdAt as confirmedAt",
		])
		.where("GroupMember.groupId", "in", [
			readyCheck.alphaGroupId,
			readyCheck.bravoGroupId,
		])
		.execute();

	return { ...readyCheck, members };
}

/** Ready checks that were started before the given time. */
export function findAllReadyChecksStartedBefore(date: Date) {
	return db
		.selectFrom("GroupReadyCheck")
		.select((eb) => [
			"GroupReadyCheck.id",
			"GroupReadyCheck.alphaGroupId",
			"GroupReadyCheck.bravoGroupId",
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.where((innerEb) =>
						innerEb.or([
							innerEb(
								"GroupMember.groupId",
								"=",
								innerEb.ref("GroupReadyCheck.alphaGroupId"),
							),
							innerEb(
								"GroupMember.groupId",
								"=",
								innerEb.ref("GroupReadyCheck.bravoGroupId"),
							),
						]),
					),
			).as("members"),
		])
		.where("GroupReadyCheck.createdAt", "<", dateToDatabaseTimestamp(date))
		.execute();
}

/** Starts a ready check between two groups, taking both and everything they had pending out of the looking pool. The starter counts as ready right away. */
export function insertReadyCheck({
	alphaGroupId,
	bravoGroupId,
	confirmedByUserId,
}: {
	alphaGroupId: number;
	bravoGroupId: number;
	confirmedByUserId: number;
}) {
	return db.transaction().execute(async (trx) => {
		// the status doubles as the lock that keeps a group out of two ready checks at once
		const { numUpdatedRows } = await trx
			.updateTable("Group")
			.set({ status: "READY_CHECK", latestActionAt: databaseTimestampNow() })
			.where("Group.id", "in", [alphaGroupId, bravoGroupId])
			.where("Group.status", "=", "ACTIVE")
			.executeTakeFirstOrThrow();

		if (Number(numUpdatedRows) !== 2) {
			throw new SendouQError("Both groups are not available for a ready check");
		}

		await deleteLikesAndSuggestionsByGroupId(alphaGroupId, trx);
		await deleteLikesAndSuggestionsByGroupId(bravoGroupId, trx);

		// a new ready check is a fresh chance to show up for everyone
		await trx
			.updateTable("GroupMember")
			.set({ missedReadyCheckAt: null })
			.where("GroupMember.groupId", "in", [alphaGroupId, bravoGroupId])
			.execute();

		const readyCheck = await trx
			.insertInto("GroupReadyCheck")
			.values({ alphaGroupId, bravoGroupId })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("GroupReadyCheckConfirmation")
			.values({ readyCheckId: readyCheck.id, userId: confirmedByUserId })
			.execute();

		return readyCheck;
	});
}

/**
 * Records the user as ready to play. Confirming twice is a no-op.
 *
 * @returns Whether every member of both groups has now confirmed, or `null` if the ready check no longer exists
 */
export function insertReadyCheckConfirmation({
	readyCheckId,
	userId,
}: {
	readyCheckId: number;
	userId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const readyCheck = await trx
			.selectFrom("GroupReadyCheck")
			.select(["GroupReadyCheck.alphaGroupId", "GroupReadyCheck.bravoGroupId"])
			.where("GroupReadyCheck.id", "=", readyCheckId)
			.executeTakeFirst();

		// someone else's request resolved the ready check while this one was in flight
		if (!readyCheck) return null;

		await trx
			.insertInto("GroupReadyCheckConfirmation")
			.values({ readyCheckId, userId })
			.onConflict((oc) => oc.columns(["readyCheckId", "userId"]).doNothing())
			.execute();

		// read back rather than trusting the caller's view of who had confirmed, so
		// that two last confirmations at once can't both conclude someone is missing
		const unconfirmedMember = await trx
			.selectFrom("GroupMember")
			.select("GroupMember.userId")
			.where("GroupMember.groupId", "in", [
				readyCheck.alphaGroupId,
				readyCheck.bravoGroupId,
			])
			.where((eb) => didNotConfirmReadyCheck(eb, readyCheckId))
			.executeTakeFirst();

		return { everyoneIsReady: !unconfirmedMember };
	});
}

/** Ends a ready check, returning both groups to the looking pool. `markMissedMembers` marks the unconfirmed as having missed it, which lets the rest of their group kick them. */
export function deleteReadyCheck(
	{ id, markMissedMembers }: { id: number; markMissedMembers: boolean },
	trx?: Transaction<DB>,
) {
	const run = (trx: Transaction<DB>) =>
		deleteReadyCheckInTrx({ id, markMissedMembers }, trx);

	return trx ? run(trx) : db.transaction().execute(run);
}

export function setPreparingGroupAsActive(groupId: number) {
	return db
		.updateTable("Group")
		.set({ status: "ACTIVE", latestActionAt: databaseTimestampNow() })
		.where("id", "=", groupId)
		.where("status", "=", "PREPARING")
		.execute();
}

export function setAsInactive(groupId: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.updateTable("Group")
		.set({ status: "INACTIVE" })
		.where("id", "=", groupId)
		.execute();
}
async function deleteReadyCheckInTrx(
	{ id, markMissedMembers }: { id: number; markMissedMembers: boolean },
	trx: Transaction<DB>,
) {
	const readyCheck = await trx
		.selectFrom("GroupReadyCheck")
		.select(["GroupReadyCheck.alphaGroupId", "GroupReadyCheck.bravoGroupId"])
		.where("GroupReadyCheck.id", "=", id)
		.executeTakeFirst();

	if (!readyCheck) return;

	const groupIds = [readyCheck.alphaGroupId, readyCheck.bravoGroupId];

	if (markMissedMembers) {
		await trx
			.updateTable("GroupMember")
			.set({ missedReadyCheckAt: databaseTimestampNow() })
			.where("GroupMember.groupId", "in", groupIds)
			.where((eb) => didNotConfirmReadyCheck(eb, id))
			.execute();
	}

	await trx
		.deleteFrom("GroupReadyCheck")
		.where("GroupReadyCheck.id", "=", id)
		.execute();

	await trx
		.updateTable("Group")
		.set({ status: "ACTIVE", latestActionAt: databaseTimestampNow() })
		.where("Group.id", "in", groupIds)
		.where("Group.status", "=", "READY_CHECK")
		.execute();
}

/**
 * Records the user as not continuing with the group they last played a matchmade match with,
 * clearing that group's yes votes: it can no longer continue at the size they were for, so the
 * rest have to vote again. Once the no vote is in, later queue actions leave that group be.
 */
async function recordImplicitRejoinNoVote(
	userId: number,
	trx: Transaction<DB>,
): Promise<number | null> {
	const candidate = await trx
		.selectFrom("GroupMember")
		.innerJoin("Group", "Group.id", "GroupMember.groupId")
		.innerJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.select((eb) => [
			"Group.id as groupId",
			"GroupMatch.chatRoomId as matchChatRoomId",
			hasVotedNo(eb, userId).as("alreadySettled"),
		])
		.where("GroupMember.userId", "=", userId)
		.where("Group.matchmade", "=", 1)
		// only the group they came from is still voting, older ones are long settled
		.orderBy("Group.id", "desc")
		.limit(1)
		.executeTakeFirst();

	if (!candidate || candidate.alreadySettled) return null;

	await trx
		.deleteFrom("GroupMatchContinueVote")
		.where("GroupMatchContinueVote.groupId", "=", candidate.groupId)
		.where("GroupMatchContinueVote.isContinuing", "=", 1)
		.execute();

	await trx
		.insertInto("GroupMatchContinueVote")
		.values({
			groupId: candidate.groupId,
			userId,
			isContinuing: 0,
		})
		.onConflict((oc) =>
			oc.columns(["groupId", "userId"]).doUpdateSet({ isContinuing: 0 }),
		)
		.execute();

	return candidate.matchChatRoomId;
}

/** Matches the `Group` rows the given user has already voted against continuing with. */
function hasVotedNo(eb: ExpressionBuilder<DB, "Group">, userId: number) {
	return eb.exists(
		eb
			.selectFrom("GroupMatchContinueVote")
			.select("GroupMatchContinueVote.id")
			.whereRef("GroupMatchContinueVote.groupId", "=", "Group.id")
			.where("GroupMatchContinueVote.userId", "=", userId)
			.where("GroupMatchContinueVote.isContinuing", "=", 0),
	);
}

/** Matches the `GroupMember` rows that have no confirmation for the given ready check. */
function didNotConfirmReadyCheck(
	eb: ExpressionBuilder<DB, "GroupMember">,
	readyCheckId: number,
) {
	return eb.not(
		eb.exists(
			eb
				.selectFrom("GroupReadyCheckConfirmation")
				.select("GroupReadyCheckConfirmation.userId")
				.where("GroupReadyCheckConfirmation.readyCheckId", "=", readyCheckId)
				.whereRef(
					"GroupReadyCheckConfirmation.userId",
					"=",
					"GroupMember.userId",
				),
		),
	);
}
