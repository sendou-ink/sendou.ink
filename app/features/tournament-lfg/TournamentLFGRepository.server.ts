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
import { randomTeamName } from "~/utils/team-name";

export function startLooking(teamId: number) {
	return db
		.updateTable("TournamentTeam")
		.set({ isLooking: 1, chatCode: shortNanoid() })
		.where("id", "=", teamId)
		.execute();
}

type CreatePlaceholderTeamArgs = {
	tournamentId: number;
	userId: number;
	isStayAsSub?: boolean;
};
export function createPlaceholderTeam(args: CreatePlaceholderTeamArgs) {
	return db.transaction().execute(async (trx) => {
		const createdTeam = await trx
			.insertInto("TournamentTeam")
			.values({
				tournamentId: args.tournamentId,
				name: randomTeamName(),
				inviteCode: shortNanoid(),
				isPlaceholder: 1,
				isLooking: 1,
				chatCode: shortNanoid(),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("TournamentTeamMember")
			.values({
				tournamentTeamId: createdTeam.id,
				userId: args.userId,
				isOwner: 1,
				role: "OWNER",
				isStayAsSub: args.isStayAsSub ? 1 : 0,
			})
			.execute();

		return createdTeam;
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
	role: Tables["TournamentTeamMember"]["role"];
	isStayAsSub: Tables["TournamentTeamMember"]["isStayAsSub"];
	weapons: Tables["User"]["qWeaponPool"];
	chatNameColor: string | null;
	plusTier: Tables["PlusTier"]["tier"] | null;
};

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
		.select(({ fn, eb }) => [
			"TournamentTeam.id",
			"TournamentTeam.chatCode",
			"TournamentTeam.isPlaceholder",
			"TournamentTeam.lfgVisibility as visibility",
			"TournamentTeam.lfgNote as note",
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
						role: eb.ref("TournamentTeamMember.role"),
						isStayAsSub: eb.ref("TournamentTeamMember.isStayAsSub"),
						weapons: eb.ref("User.qWeaponPool"),
						chatNameColor: userChatNameColorForJson,
						plusTier: eb.ref("PlusTier.tier"),
					}),
				])
				.$castTo<TournamentLFGMemberObject[]>()
				.as("members"),
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isLooking", "=", 1)
		.groupBy("TournamentTeam.id")
		.execute();
}

// xxx: ensure that the team size does not exceed the max, also filter out in frontend
export function mergeTeams({
	survivingTeamId,
	otherTeamId,
	maxGroupSize,
}: {
	survivingTeamId: number;
	otherTeamId: number;
	maxGroupSize: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("TournamentTeam")
			.set({ chatCode: shortNanoid() })
			.where("TournamentTeam.id", "=", survivingTeamId)
			.execute();

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
				})
				.where("TournamentTeamMember.tournamentTeamId", "=", otherTeamId)
				.where("TournamentTeamMember.userId", "=", member.userId)
				.execute();
		}

		await deleteLikesByTeamId(survivingTeamId, trx);

		await trx
			.deleteFrom("TournamentTeam")
			.where("TournamentTeam.id", "=", otherTeamId)
			.execute();

		const memberCount = await getMemberCount(survivingTeamId, trx);

		invariant(
			memberCount <= maxGroupSize,
			"Group has too many members after merge",
		);

		if (memberCount >= maxGroupSize) {
			await trx
				.updateTable("TournamentTeam")
				.set({ isLooking: 0 })
				.where("id", "=", survivingTeamId)
				.execute();
		}
	});
}

export async function addLike({
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

export async function allLikesByTeamId(teamId: number) {
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

export function updateStayAsSub({
	teamId,
	userId,
	value,
}: {
	teamId: number;
	userId: number;
	value: boolean;
}) {
	return db
		.updateTable("TournamentTeamMember")
		.set({ isStayAsSub: value ? 1 : 0 })
		.where("tournamentTeamId", "=", teamId)
		.where("userId", "=", userId)
		.execute();
}

export function leaveLfg({
	userId,
	tournamentId,
}: {
	userId: number;
	tournamentId: number;
}) {
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
				"TournamentTeamMember.role",
				"TournamentTeam.isPlaceholder",
			])
			.where("TournamentTeamMember.userId", "=", userId)
			.where("TournamentTeam.tournamentId", "=", tournamentId)
			.where("TournamentTeam.isLooking", "=", 1)
			.executeTakeFirstOrThrow();

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
			return;
		}

		// xxx: or just call TournamentTeam.unregister?
		// xxx: also leaving team should not be possible via this so remove that code
		await trx
			.deleteFrom("TournamentTeamMember")
			.where("userId", "=", userId)
			.where("tournamentTeamId", "=", userTeam.tournamentTeamId)
			.execute();

		const remainingMembers = await trx
			.selectFrom("TournamentTeamMember")
			.select(["userId", "role"])
			.where("tournamentTeamId", "=", userTeam.tournamentTeamId)
			.execute();

		if (remainingMembers.length === 0) {
			await trx
				.deleteFrom("TournamentTeam")
				.where("id", "=", userTeam.tournamentTeamId)
				.execute();
			return;
		}

		if (userTeam.role === "OWNER") {
			const newOwner =
				remainingMembers.find((m) => m.role === "MANAGER") ??
				remainingMembers[0];

			await trx
				.updateTable("TournamentTeamMember")
				.set({ role: "OWNER" })
				.where("userId", "=", newOwner.userId)
				.where("tournamentTeamId", "=", userTeam.tournamentTeamId)
				.execute();
		}
	});
}

export async function getSubsForTournament(tournamentId: number) {
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

async function getMemberCount(
	teamId: number,
	trx: Transaction<DB>,
): Promise<number> {
	const members = await trx
		.selectFrom("TournamentTeamMember")
		.select("TournamentTeamMember.userId")
		.where("TournamentTeamMember.tournamentTeamId", "=", teamId)
		.execute();

	return members.length;
}
