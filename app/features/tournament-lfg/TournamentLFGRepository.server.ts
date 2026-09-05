import type { ExpressionBuilder, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import invariant from "~/utils/invariant";
import {
	commonUserMembersAgg,
	concatUserSubmittedImagePrefix,
	matchProfileWeapons,
} from "~/utils/kysely.server";
import { errorIsSqliteForeignKeyConstraintFailure } from "~/utils/sql";
import { randomTeamName } from "~/utils/team-name";

/** @returns user ids whose chat room set changed, for `notifyRoomsChanged`. */
export function startLooking(args: {
	teamId: number;
	chatRoomExpiresAt: Date;
}): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeam")
			.set({ isLooking: 1 })
			.where("id", "=", args.teamId)
			.execute();

		return ensurePickupChatRoom(args.teamId, args.chatRoomExpiresAt, trx);
	});
}

type CreatePlaceholderTeamArgs = {
	tournamentId: number;
	userId: number;
	isStayAsSub?: boolean;
	lfgNote?: string;
};
export function insertPlaceholderTeam(args: CreatePlaceholderTeamArgs) {
	return db.transaction().execute(async (trx) => {
		const createdTeam = await trx
			.insertInto("TournamentTeam")
			.values({
				tournamentId: args.tournamentId,
				name: randomTeamName(),
				inviteCode: shortNanoid(),
				isPlaceholder: 1,
				isLooking: 1,
				lfgNote: args.lfgNote ?? null,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: createdTeam.id,
				userId: args.userId,
				role: "OWNER",
				isStayAsSub: args.isStayAsSub ? 1 : 0,
			})
			.execute();

		return createdTeam;
	});
}

export async function findLookingTeamsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeamMember.tournamentTeamId",
			"TournamentTeam.id",
		)
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"TournamentTeam.avatarImgId",
		)
		.select(({ eb }) => [
			"TournamentTeam.id",
			"TournamentTeam.isPlaceholder",
			"TournamentTeam.lfgNote as note",
			"TournamentTeam.name as teamName",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"teamAvatarUrl",
			),
			lfgMembersAgg(eb).as("members"),
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isLooking", "=", 1)
		.groupBy("TournamentTeam.id")
		.execute();
}

export async function findSubGroups(tournamentId: number) {
	const rows = await db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"TournamentTeamMember",
			"TournamentTeamMember.tournamentTeamId",
			"TournamentTeam.id",
		)
		.innerJoin("User", "User.id", "TournamentTeamMember.userId")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(({ eb }) => [
			"TournamentTeam.id",
			"TournamentTeam.lfgNote as message",
			lfgMembersAgg(eb).as("members"),
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isPlaceholder", "=", 1)
		.where("TournamentTeamMember.isStayAsSub", "=", 1)
		.groupBy("TournamentTeam.id")
		.execute();

	return rows;
}

/** @returns user ids whose chat room set changed, for `notifyRoomsChanged`. */
export function mergeTeams({
	survivingTeamId,
	otherTeamId,
	maxGroupSize,
	chatRoomExpiresAt,
}: {
	survivingTeamId: number;
	otherTeamId: number;
	maxGroupSize: number;
	chatRoomExpiresAt: Date;
}): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		const otherTeam = await trx
			.selectFrom("TournamentTeam")
			.select("chatRoomId")
			.where("id", "=", otherTeamId)
			.executeTakeFirst();

		const otherMembers = await trx
			.selectFrom("TournamentTeamMember")
			.select(["TournamentTeamMember.userId", "TournamentTeamMember.role"])
			.where("TournamentTeamMember.tournamentTeamId", "=", otherTeamId)
			.execute();

		for (const member of otherMembers) {
			await trx
				.updateTable("TournamentTeamMember")
				.set({
					role: member.role === "OWNER" ? "MANAGER" : member.role,
					tournamentTeamId: survivingTeamId,
					// reset so the merged-in members sort after the surviving team's original members
					createdAt: databaseTimestampNow(),
				})
				.where("TournamentTeamMember.tournamentTeamId", "=", otherTeamId)
				.where("TournamentTeamMember.userId", "=", member.userId)
				.execute();
		}

		await deleteLikesByTeamId(survivingTeamId, trx);

		await ChatRepository.deleteRoomsByIds([otherTeam?.chatRoomId ?? null], trx);

		await trx
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", otherTeamId)
			.execute();

		const memberUserIds = await findMemberUserIds(survivingTeamId, trx);

		invariant(
			memberUserIds.length <= maxGroupSize,
			"Group has too many members after merge",
		);

		await trx
			.updateTable("TournamentTeam")
			.set({
				isLooking: memberUserIds.length >= maxGroupSize ? 0 : undefined,
				isPlaceholder: 0,
			})
			.where("id", "=", survivingTeamId)
			.execute();

		await ensurePickupChatRoom(survivingTeamId, chatRoomExpiresAt, trx);

		// merged-in members lost their old room or gained the surviving team's, which may itself be new
		return memberUserIds;
	});
}

export async function insertLike({
	likerTeamId,
	targetTeamId,
}: {
	likerTeamId: number;
	targetTeamId: number;
}) {
	try {
		await db
			.insertInto("TournamentLFGLike")
			.values({ likerTeamId, targetTeamId })
			.onConflict((oc) =>
				oc.columns(["likerTeamId", "targetTeamId"]).doNothing(),
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
	likerTeamId,
	targetTeamId,
}: {
	likerTeamId: number;
	targetTeamId: number;
}) {
	return db
		.deleteFrom("TournamentLFGLike")
		.where("likerTeamId", "=", likerTeamId)
		.where("targetTeamId", "=", targetTeamId)
		.execute();
}

export async function findAllLikesByTeamId(teamId: number) {
	const rows = await db
		.selectFrom("TournamentLFGLike")
		.select(["TournamentLFGLike.likerTeamId", "TournamentLFGLike.targetTeamId"])
		.where((eb) =>
			eb.or([
				eb("TournamentLFGLike.likerTeamId", "=", teamId),
				eb("TournamentLFGLike.targetTeamId", "=", teamId),
			]),
		)
		.execute();

	return {
		given: rows
			.filter((row) => row.likerTeamId === teamId)
			.map((row) => ({ teamId: row.targetTeamId })),
		received: rows
			.filter((row) => row.targetTeamId === teamId)
			.map((row) => ({ teamId: row.likerTeamId })),
	};
}

export function updateTeamNote({
	teamId,
	value,
}: {
	teamId: number;
	value: string | null;
}) {
	return db
		.updateTable("TournamentTeam")
		.set({ lfgNote: value })
		.where("id", "=", teamId)
		.execute();
}

export function updateMemberRole({
	userId,
	teamId,
	role,
}: {
	userId: number;
	teamId: number;
	role: Tables["TournamentTeamMember"]["role"];
}) {
	if (role === "OWNER") {
		throw new Error("Can't set role to OWNER with this function");
	}

	return db
		.updateTable("TournamentTeamMember")
		.set({ role })
		.where("userId", "=", userId)
		.where("tournamentTeamId", "=", teamId)
		.execute();
}

export function updateOwnStayAsSub({
	teamId,
	value,
}: {
	teamId: number;
	value: boolean;
}) {
	return db
		.updateTable("TournamentTeamMember")
		.set({ isStayAsSub: value ? 1 : 0 })
		.where("tournamentTeamId", "=", teamId)
		.where("userId", "=", actorId())
		.execute();
}

/** @returns user ids whose chat room set changed, for `notifyRoomsChanged`. */
export function leaveLfg({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		const userTeam = await trx
			.selectFrom("TournamentTeamMember")
			.innerJoin(
				"TournamentTeam",
				"TournamentTeam.id",
				"TournamentTeamMember.tournamentTeamId",
			)
			.select([
				"TournamentTeamMember.tournamentTeamId",
				"TournamentTeam.isPlaceholder",
				"TournamentTeam.chatRoomId",
			])
			.where("TournamentTeamMember.userId", "=", userId)
			.where("TournamentTeam.tournamentId", "=", tournamentId)
			.where("TournamentTeam.isLooking", "=", 1)
			.executeTakeFirst();

		if (!userTeam) return [];

		if (!userTeam.isPlaceholder) {
			await trx
				.updateTable("TournamentTeam")
				.set({ isLooking: 0 })
				.where("id", "=", userTeam.tournamentTeamId)
				.execute();
			await trx
				.updateTable("TournamentTeamMember")
				.set({ isStayAsSub: 0 })
				.where("tournamentTeamId", "=", userTeam.tournamentTeamId)
				.execute();
			await deleteLikesByTeamId(userTeam.tournamentTeamId, trx);
			return [];
		}

		const memberUserIds = userTeam.chatRoomId
			? await findMemberUserIds(userTeam.tournamentTeamId, trx)
			: [];

		await ChatRepository.deleteRoomsByIds([userTeam.chatRoomId], trx);

		await trx
			.deleteFrom("TournamentTeam")
			.where("id", "=", userTeam.tournamentTeamId)
			.execute();

		return memberUserIds;
	});
}

export async function findAllSubsByTournamentId(tournamentId: number) {
	const rows = await db
		.selectFrom("TournamentTeamMember")
		.innerJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.select("TournamentTeamMember.userId")
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeamMember.isStayAsSub", "=", 1)
		.execute();

	return rows.map((row) => row.userId);
}

function lfgMembersAgg(
	eb: ExpressionBuilder<DB, "User" | "TournamentTeamMember" | "PlusTier">,
) {
	return commonUserMembersAgg(eb, {
		languages: eb.ref("User.languages"),
		vc: eb.ref("User.vc"),
		role: eb.ref("TournamentTeamMember.role"),
		isStayAsSub: eb.ref("TournamentTeamMember.isStayAsSub"),
		weapons: matchProfileWeapons(eb),
		// both callers left join PlusTier which the signature can't express
		plusTier: eb.ref("PlusTier.tier").$castTo<number | null>(),
	});
}

function deleteLikesByTeamId(teamId: number, trx: Transaction<DB>) {
	return trx
		.deleteFrom("TournamentLFGLike")
		.where((eb) =>
			eb.or([
				eb("TournamentLFGLike.likerTeamId", "=", teamId),
				eb("TournamentLFGLike.targetTeamId", "=", teamId),
			]),
		)
		.execute();
}

async function findMemberUserIds(
	teamId: number,
	trx: Transaction<DB>,
): Promise<number[]> {
	const members = await trx
		.selectFrom("TournamentTeamMember")
		.select("TournamentTeamMember.userId")
		.where("TournamentTeamMember.tournamentTeamId", "=", teamId)
		.execute();

	return members.map((member) => member.userId);
}

/** @returns the members who gained a room, empty when none was created. */
async function ensurePickupChatRoom(
	teamId: number,
	chatRoomExpiresAt: Date,
	trx: Transaction<DB>,
): Promise<number[]> {
	const team = await trx
		.selectFrom("TournamentTeam")
		.select("chatRoomId")
		.where("id", "=", teamId)
		.executeTakeFirstOrThrow();

	if (team.chatRoomId !== null) return [];

	const memberUserIds = await findMemberUserIds(teamId, trx);
	if (memberUserIds.length < 2) return [];

	const room = await ChatRepository.insertRoom(
		{ type: "TOURNAMENT_TEAM", expiresAt: chatRoomExpiresAt },
		trx,
	);

	await trx
		.updateTable("TournamentTeam")
		.set({ chatRoomId: room.id })
		.where("id", "=", teamId)
		.execute();

	return memberUserIds;
}
