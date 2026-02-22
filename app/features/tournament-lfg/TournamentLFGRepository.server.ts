import type { Transaction } from "kysely";
import { jsonBuildObject } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	concatUserSubmittedImagePrefix,
	userChatNameColorForJson,
} from "~/utils/kysely.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";

type CreateGroupFromTeamArgs = {
	tournamentId: number;
	tournamentTeamId: number;
	members: Array<{ userId: number; isOwner: boolean }>;
};
export function createGroupFromTeam(args: CreateGroupFromTeamArgs) {
	return db.transaction().execute(async (trx) => {
		const createdGroup = await trx
			.insertInto("TournamentLFGGroup")
			.values({
				tournamentId: args.tournamentId,
				tournamentTeamId: args.tournamentTeamId,
				chatCode: shortNanoid(),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		for (const member of args.members) {
			await trx
				.insertInto("TournamentLFGGroupMember")
				.values({
					groupId: createdGroup.id,
					tournamentId: args.tournamentId,
					userId: member.userId,
					role: member.isOwner ? "OWNER" : "REGULAR",
				})
				.execute();
		}

		return createdGroup;
	});
}

type CreateGroupArgs = {
	tournamentId: number;
	userId: number;
	isStayAsSub?: boolean;
};
export function createGroup(args: CreateGroupArgs) {
	return db.transaction().execute(async (trx) => {
		const createdGroup = await trx
			.insertInto("TournamentLFGGroup")
			.values({
				tournamentId: args.tournamentId,
				chatCode: shortNanoid(),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("TournamentLFGGroupMember")
			.values({
				groupId: createdGroup.id,
				tournamentId: args.tournamentId,
				userId: args.userId,
				role: "OWNER",
				isStayAsSub: args.isStayAsSub ? 1 : 0,
			})
			.execute();

		return createdGroup;
	});
}

type TournamentLFGMemberObject = {
	id: Tables["User"]["id"];
	username: Tables["User"]["username"];
	discordId: Tables["User"]["discordId"];
	discordAvatar: Tables["User"]["discordAvatar"];
	customUrl: Tables["User"]["customUrl"];
	languages: Tables["User"]["languages"];
	vc: Tables["User"]["vc"];
	pronouns: Tables["User"]["pronouns"];
	role: Tables["TournamentLFGGroupMember"]["role"];
	note: Tables["TournamentLFGGroupMember"]["note"];
	isStayAsSub: Tables["TournamentLFGGroupMember"]["isStayAsSub"];
	weapons: Tables["User"]["qWeaponPool"];
	chatNameColor: string | null;
	plusTier: Tables["PlusTier"]["tier"] | null;
};

export async function findGroupsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentLFGGroup")
		.innerJoin(
			"TournamentLFGGroupMember",
			"TournamentLFGGroupMember.groupId",
			"TournamentLFGGroup.id",
		)
		.innerJoin("User", "User.id", "TournamentLFGGroupMember.userId")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.leftJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentLFGGroup.tournamentTeamId",
		)
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentTeam.avatarImgId",
		)
		.select(({ fn, eb }) => [
			"TournamentLFGGroup.id",
			"TournamentLFGGroup.chatCode",
			"TournamentLFGGroup.tournamentTeamId",
			"TournamentLFGGroup.visibility",
			"TournamentTeam.name as teamName",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"teamAvatarUrl",
			),
			fn
				.agg("json_group_array", [
					jsonBuildObject({
						id: eb.ref("User.id"),
						username: eb.ref("User.username"),
						discordId: eb.ref("User.discordId"),
						discordAvatar: eb.ref("User.discordAvatar"),
						customUrl: eb.ref("User.customUrl"),
						languages: eb.ref("User.languages"),
						vc: eb.ref("User.vc"),
						pronouns: eb.ref("User.pronouns"),
						role: eb.ref("TournamentLFGGroupMember.role"),
						note: eb.ref("TournamentLFGGroupMember.note"),
						isStayAsSub: eb.ref("TournamentLFGGroupMember.isStayAsSub"),
						weapons: eb.ref("User.qWeaponPool"),
						chatNameColor: userChatNameColorForJson,
						plusTier: eb.ref("PlusTier.tier"),
					}),
				])
				.$castTo<TournamentLFGMemberObject[]>()
				.as("members"),
		])
		.where("TournamentLFGGroup.tournamentId", "=", tournamentId)
		.groupBy("TournamentLFGGroup.id")
		.execute();
}

export function morphGroups({
	survivingGroupId,
	otherGroupId,
	maxGroupSize,
	tournamentId,
}: {
	survivingGroupId: number;
	otherGroupId: number;
	maxGroupSize: number;
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const survivingGroup = await trx
			.selectFrom("TournamentLFGGroup")
			.select("tournamentTeamId")
			.where("id", "=", survivingGroupId)
			.executeTakeFirstOrThrow();

		if (!survivingGroup.tournamentTeamId) {
			const createdTeam = await trx
				.insertInto("TournamentTeam")
				.values({
					tournamentId,
					name: `LFG Team ${shortNanoid()}`,
					inviteCode: "",
				})
				.returning("id")
				.executeTakeFirstOrThrow();

			await trx
				.updateTable("TournamentLFGGroup")
				.set({ tournamentTeamId: createdTeam.id })
				.where("id", "=", survivingGroupId)
				.execute();
		}

		await trx
			.updateTable("TournamentLFGGroup")
			.set({ chatCode: shortNanoid() })
			.where("TournamentLFGGroup.id", "=", survivingGroupId)
			.execute();

		const otherGroupMembers = await trx
			.selectFrom("TournamentLFGGroupMember")
			.select([
				"TournamentLFGGroupMember.userId",
				"TournamentLFGGroupMember.role",
			])
			.where("TournamentLFGGroupMember.groupId", "=", otherGroupId)
			.execute();

		for (const member of otherGroupMembers) {
			await trx
				.updateTable("TournamentLFGGroupMember")
				.set({
					role: member.role === "OWNER" ? "MANAGER" : member.role,
					groupId: survivingGroupId,
				})
				.where("TournamentLFGGroupMember.groupId", "=", otherGroupId)
				.where("TournamentLFGGroupMember.userId", "=", member.userId)
				.execute();
		}

		await deleteLikesByGroupId(survivingGroupId, trx);

		await trx
			.deleteFrom("TournamentLFGGroup")
			.where("TournamentLFGGroup.id", "=", otherGroupId)
			.execute();

		invariant(
			await isGroupCorrect(survivingGroupId, trx, maxGroupSize),
			"Group has too many members after merge",
		);
	});
}

export async function addLike({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	try {
		await db
			.insertInto("TournamentLFGLike")
			.values({ likerGroupId, targetGroupId })
			.onConflict((oc) =>
				oc.columns(["likerGroupId", "targetGroupId"]).doNothing(),
			)
			.execute();
	} catch (error) {
		if (errorIsSqliteForeignKeyConstraintFailure(error)) {
			return;
		}
		throw error;
	}
}

export function deleteLike({
	likerGroupId,
	targetGroupId,
}: {
	likerGroupId: number;
	targetGroupId: number;
}) {
	return db
		.deleteFrom("TournamentLFGLike")
		.where("likerGroupId", "=", likerGroupId)
		.where("targetGroupId", "=", targetGroupId)
		.execute();
}

export async function allLikesByGroupId(groupId: number) {
	const rows = await db
		.selectFrom("TournamentLFGLike")
		.select([
			"TournamentLFGLike.likerGroupId",
			"TournamentLFGLike.targetGroupId",
		])
		.where((eb) =>
			eb.or([
				eb("TournamentLFGLike.likerGroupId", "=", groupId),
				eb("TournamentLFGLike.targetGroupId", "=", groupId),
			]),
		)
		.execute();

	return {
		given: rows
			.filter((row) => row.likerGroupId === groupId)
			.map((row) => ({ groupId: row.targetGroupId })),
		received: rows
			.filter((row) => row.targetGroupId === groupId)
			.map((row) => ({ groupId: row.likerGroupId })),
	};
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
	return db
		.updateTable("TournamentLFGGroupMember")
		.set({ note: value })
		.where("groupId", "=", groupId)
		.where("userId", "=", userId)
		.execute();
}

export function updateMemberRole({
	userId,
	groupId,
	role,
}: {
	userId: number;
	groupId: number;
	role: Tables["TournamentLFGGroupMember"]["role"];
}) {
	if (role === "OWNER") {
		throw new Error("Can't set role to OWNER with this function");
	}

	return db
		.updateTable("TournamentLFGGroupMember")
		.set({ role })
		.where("userId", "=", userId)
		.where("groupId", "=", groupId)
		.execute();
}

export function updateStayAsSub({
	groupId,
	userId,
	value,
}: {
	groupId: number;
	userId: number;
	value: boolean;
}) {
	return db
		.updateTable("TournamentLFGGroupMember")
		.set({ isStayAsSub: value ? 1 : 0 })
		.where("groupId", "=", groupId)
		.where("userId", "=", userId)
		.execute();
}

export function leaveGroup({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const userGroup = await trx
			.selectFrom("TournamentLFGGroupMember")
			.select([
				"TournamentLFGGroupMember.groupId",
				"TournamentLFGGroupMember.role",
			])
			.where("TournamentLFGGroupMember.userId", "=", userId)
			.where("TournamentLFGGroupMember.tournamentId", "=", tournamentId)
			.executeTakeFirstOrThrow();

		await trx
			.deleteFrom("TournamentLFGGroupMember")
			.where("userId", "=", userId)
			.where("groupId", "=", userGroup.groupId)
			.execute();

		const remainingMembers = await trx
			.selectFrom("TournamentLFGGroupMember")
			.select(["userId", "role"])
			.where("groupId", "=", userGroup.groupId)
			.execute();

		if (remainingMembers.length === 0) {
			await trx
				.deleteFrom("TournamentLFGGroup")
				.where("id", "=", userGroup.groupId)
				.execute();
			return;
		}

		if (userGroup.role === "OWNER") {
			const newOwner =
				remainingMembers.find((m) => m.role === "MANAGER") ??
				remainingMembers[0];

			await trx
				.updateTable("TournamentLFGGroupMember")
				.set({ role: "OWNER" })
				.where("userId", "=", newOwner.userId)
				.where("groupId", "=", userGroup.groupId)
				.execute();
		}
	});
}

export function cleanupForTournamentStart(tournamentId: number) {
	return db
		.deleteFrom("TournamentLFGGroup")
		.where("TournamentLFGGroup.tournamentId", "=", tournamentId)
		.execute();
}

export async function getSubsForTournament(tournamentId: number) {
	const rows = await db
		.selectFrom("TournamentLFGGroupMember")
		.select("TournamentLFGGroupMember.userId")
		.where("TournamentLFGGroupMember.tournamentId", "=", tournamentId)
		.where("TournamentLFGGroupMember.isStayAsSub", "=", 1)
		.execute();

	return rows.map((row) => row.userId);
}

function deleteLikesByGroupId(groupId: number, trx: Transaction<DB>) {
	return trx
		.deleteFrom("TournamentLFGLike")
		.where((eb) =>
			eb.or([
				eb("TournamentLFGLike.likerGroupId", "=", groupId),
				eb("TournamentLFGLike.targetGroupId", "=", groupId),
			]),
		)
		.execute();
}

async function isGroupCorrect(
	groupId: number,
	trx: Transaction<DB>,
	maxGroupSize: number,
): Promise<boolean> {
	const members = await trx
		.selectFrom("TournamentLFGGroupMember")
		.select("TournamentLFGGroupMember.userId")
		.where("TournamentLFGGroupMember.groupId", "=", groupId)
		.execute();

	return members.length <= maxGroupSize;
}
