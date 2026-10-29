import type { ExpressionBuilder, Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { invariant } from "~/utils/invariant";
import {
	commonUserMembersAgg,
	concatUserSubmittedImagePrefix,
	matchProfileWeapons,
} from "~/utils/kysely.server";
import {
	errorIsSqliteForeignKeyConstraintFailure,
	toDBBoolean,
} from "~/utils/sql";
import { randomTeamName } from "~/utils/team-name";

/**
 * Puts a registered team in the queue to look for more members, giving it a chat room once it has two members.
 * @returns user ids whose chat room set changed, for `notifyRoomsChanged`.
 */
export function startLooking(args: { teamId: number }): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeam")
			.set({ isLooking: 1 })
			.where("id", "=", args.teamId)
			.execute();

		return TournamentTeamRepository.ensureChatRoom(args.teamId, trx);
	});
}

type CreatePlaceholderTeamArgs = {
	tournamentId: number;
	userId: number;
	isStayAsSub?: boolean;
	lfgNote?: string;
};
/** Puts a player without a team in the queue as a placeholder team of their own, also how a sub post is made (`isStayAsSub`). */
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
				isStayAsSub: toDBBoolean(args.isStayAsSub ?? false),
			})
			.execute();

		return createdTeam;
	});
}

/**
 * Groups in the tournament's queue, placeholders and registered teams looking for more members alike. The owner and
 * managers of a group handle its invitations, only the owner its members' roles and its note.
 */
export async function findLookingTeamsByTournamentId(tournamentId: number) {
	const rows = await db
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

	return rows.map((row) => {
		const ownerIds = row.members
			.filter((member) => member.role === "OWNER")
			.map((member) => member.id);
		const managerIds = row.members
			.filter((member) => member.role !== "REGULAR")
			.map((member) => member.id);

		return {
			...row,
			permissions: {
				MANAGE_INVITATIONS: managerIds,
				MANAGE_ROLES: ownerIds,
				EDIT_NOTE: ownerIds,
			},
		};
	});
}

/** Sub posts of the tournament: placeholders of players who stay as sub, listed once registration has closed. */
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

/**
 * Moves the members of `otherTeamId` to `survivingTeamId` (its owner becoming a manager) and deletes the other team. The
 * merged team is a registered one, leaving the queue once full. Clears the likes of the surviving team.
 * @returns user ids whose chat room set changed, for `notifyRoomsChanged`.
 */
export function mergeTeams({
	survivingTeamId,
	otherTeamId,
	maxGroupSize,
	requireInGameNames,
}: {
	survivingTeamId: number;
	otherTeamId: number;
	maxGroupSize: number;
	/** Fills the in-game name of members who don't have one yet, as registering does. */
	requireInGameNames: boolean;
}): Promise<number[]> {
	return db.transaction().execute(async (trx) => {
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

		if (requireInGameNames) {
			await trx
				.updateTable("TournamentTeamMember")
				.set((eb) => ({
					inGameName: eb
						.selectFrom("User")
						.select("User.inGameName")
						.whereRef("User.id", "=", "TournamentTeamMember.userId"),
				}))
				.where("TournamentTeamMember.tournamentTeamId", "=", survivingTeamId)
				.where("TournamentTeamMember.inGameName", "is", null)
				.execute();
		}

		await deleteLikesByTeamId(survivingTeamId, trx);

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

		await TournamentTeamRepository.ensureChatRoom(survivingTeamId, trx);

		// merged-in members lost their old room or gained the surviving team's, which may itself be new
		return memberUserIds;
	});
}

/** One group inviting another, a no-op when already invited or when either has left the queue since. */
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

/** Withdraws an invitation. */
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

/** Invitations the group has given and received, each as the id of the other group. */
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

/** Sets the note shown on the group's card, `null` to remove it. */
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

/** Makes a member of the group a manager or a regular member. @throws if `role` is `OWNER`. */
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

/** Sets whether the acting user stays as sub if their group finds no members before registration closes. */
export function updateOwnStayAsSub({
	teamId,
	value,
}: {
	teamId: number;
	value: boolean;
}) {
	return db
		.updateTable("TournamentTeamMember")
		.set({ isStayAsSub: toDBBoolean(value) })
		.where("tournamentTeamId", "=", teamId)
		.where("userId", "=", actorId())
		.execute();
}

/**
 * Takes the user's group out of the queue: a placeholder (sub posts included) is deleted, a registered team only stops
 * looking, losing its likes and its members' stay as sub preference.
 * @returns user ids whose chat room set changed, for `notifyRoomsChanged`.
 */
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
			// starting a bracket clears isLooking, also from sub posts
			.where((eb) =>
				eb.or([
					eb("TournamentTeam.isLooking", "=", 1),
					eb("TournamentTeam.isPlaceholder", "=", 1),
				]),
			)
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

		await trx
			.deleteFrom("TournamentTeam")
			.where("id", "=", userTeam.tournamentTeamId)
			.execute();

		return memberUserIds;
	});
}

/** Ids of the tournament's users who stay as sub. */
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
