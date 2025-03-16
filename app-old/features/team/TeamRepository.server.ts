import type { Insertable, Transaction } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { nanoid } from "nanoid";
import { INVITE_CODE_LENGTH } from "~/constants";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

export function findAllUndisbanded() {
	return db
		.selectFrom("Team")
		.select(({ eb }) => [
			"Team.customUrl",
			"Team.name",
			eb
				.selectFrom("UserSubmittedImage")
				.whereRef("UserSubmittedImage.id", "=", "Team.avatarImgId")
				.select("UserSubmittedImage.url")
				.as("avatarSrc"),
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
					.leftJoin("PlusTier", "PlusTier.userId", "User.id")
					.select(["User.id", "User.username", "PlusTier.tier as plusTier"])
					.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id"),
			).as("members"),
		])
		.execute();
}

export function findAllMemberOfByUserId(userId: number) {
	return db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.leftJoin("UserSubmittedImage", "UserSubmittedImage.id", "Team.avatarImgId")
		.select([
			"Team.id",
			"Team.customUrl",
			"Team.name",
			"UserSubmittedImage.url as logoUrl",
		])
		.where("TeamMemberWithSecondary.userId", "=", userId)
		.execute();
}

export type findByCustomUrl = NonNullable<
	Awaited<ReturnType<typeof findByCustomUrl>>
>;

export function findByCustomUrl(
	customUrl: string,
	{ includeInviteCode = false } = {},
) {
	return db
		.selectFrom("Team")
		.leftJoin(
			"UserSubmittedImage as AvatarImage",
			"AvatarImage.id",
			"Team.avatarImgId",
		)
		.leftJoin(
			"UserSubmittedImage as BannerImage",
			"BannerImage.id",
			"Team.bannerImgId",
		)
		.select(({ eb }) => [
			"Team.id",
			"Team.name",
			"Team.bsky",
			"Team.bio",
			"Team.customUrl",
			"Team.css",
			"AvatarImage.url as avatarSrc",
			"BannerImage.url as bannerSrc",
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
					.select(({ eb: innerEb }) => [
						...COMMON_USER_FIELDS,
						"TeamMemberWithSecondary.role",
						"TeamMemberWithSecondary.isOwner",
						"TeamMemberWithSecondary.isManager",
						"TeamMemberWithSecondary.isMainTeam",
						"User.country",
						"User.patronTier",
						jsonArrayFrom(
							innerEb
								.selectFrom("UserWeapon")
								.select(["UserWeapon.weaponSplId", "UserWeapon.isFavorite"])
								.whereRef("UserWeapon.userId", "=", "User.id"),
						).as("weapons"),
					])
					.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id"),
			).as("members"),
		])
		.$if(includeInviteCode, (qb) => qb.select("Team.inviteCode"))
		.where("Team.customUrl", "=", customUrl.toLowerCase())
		.executeTakeFirst();
}

export async function teamsByMemberUserId(
	userId: number,
	trx?: Transaction<DB>,
) {
	return (trx ?? db)
		.selectFrom("TeamMemberWithSecondary")
		.select([
			"TeamMemberWithSecondary.teamId as id",
			"TeamMemberWithSecondary.isOwner",
			"TeamMemberWithSecondary.isMainTeam",
		])
		.where("userId", "=", userId)
		.execute();
}

export async function create(
	args: Pick<Insertable<Tables["Team"]>, "name" | "customUrl"> & {
		ownerUserId: number;
		isMainTeam: boolean;
	},
) {
	return db.transaction().execute(async (trx) => {
		const team = await trx
			.insertInto("AllTeam")
			.values({
				name: args.name,
				customUrl: args.customUrl,
				inviteCode: nanoid(INVITE_CODE_LENGTH),
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("AllTeamMember")
			.values({
				userId: args.ownerUserId,
				teamId: team.id,
				isOwner: 1,
				isMainTeam: Number(args.isMainTeam),
			})
			.execute();
	});
}

export async function update({
	id,
	name,
	customUrl,
	bio,
	bsky,
	css,
}: Pick<
	Insertable<Tables["Team"]>,
	"id" | "name" | "customUrl" | "bio" | "bsky"
> & { css: string | null }) {
	return db
		.updateTable("AllTeam")
		.set({
			name,
			customUrl,
			bio,
			bsky,
			css,
		})
		.where("id", "=", id)
		.returningAll()
		.executeTakeFirstOrThrow();
}

export function switchMainTeam({
	userId,
	teamId,
}: {
	userId: number;
	teamId: number;
}) {
	return db.transaction().execute(async (trx) => {
		const currentTeams = await teamsByMemberUserId(userId, trx);

		const teamToSwitchTo = currentTeams.find((team) => team.id === teamId);
		invariant(teamToSwitchTo, "User is not a member of this team");

		await trx
			.updateTable("AllTeamMember")
			.set({
				isMainTeam: 0,
			})
			.where("userId", "=", userId)
			.execute();

		await trx
			.updateTable("AllTeamMember")
			.set({
				isMainTeam: 1,
			})
			.where("userId", "=", userId)
			.where("teamId", "=", teamId)
			.execute();
	});
}

export function del(teamId: number) {
	return db.transaction().execute(async (trx) => {
		const members = await trx
			.selectFrom("TeamMember")
			.select(["TeamMember.userId"])
			.where("teamId", "=", teamId)
			.execute();

		// switch main team to another if they at least one secondary team
		for (const member of members) {
			const currentTeams = await teamsByMemberUserId(member.userId, trx);

			const teamToSwitchTo = currentTeams.find((team) => team.id !== teamId);

			if (!teamToSwitchTo) continue;

			await trx
				.updateTable("AllTeamMember")
				.set({
					isMainTeam: 1,
				})
				.where("userId", "=", member.userId)
				.where("teamId", "=", teamToSwitchTo.id)
				.execute();
		}

		await trx
			.updateTable("AllTeamMember")
			.set({
				isMainTeam: 0,
			})
			.where("AllTeamMember.teamId", "=", teamId)
			.execute();

		await LFGRepository.deletePostsByTeamId(teamId, trx);

		await trx
			.updateTable("AllTeam")
			.set({
				deletedAt: databaseTimestampNow(),
			})
			.where("id", "=", teamId)
			.execute();
	});
}

export function resetInviteCode(teamId: number) {
	return db
		.updateTable("AllTeam")
		.set({
			inviteCode: nanoid(INVITE_CODE_LENGTH),
		})
		.where("id", "=", teamId)
		.execute();
}

export function addNewTeamMember({
	userId,
	teamId,
	maxTeamsAllowed,
}: {
	userId: number;
	teamId: number;
	maxTeamsAllowed: number;
}) {
	return db.transaction().execute(async (trx) => {
		const teamCount = (await teamsByMemberUserId(userId, trx)).length;

		if (teamCount >= maxTeamsAllowed) {
			throw new Error("Trying to exceed allowed team count");
		}

		const isMainTeam = Number(teamCount === 0);

		await trx
			.insertInto("AllTeamMember")
			.values({ userId, teamId, isMainTeam })
			.onConflict((oc) =>
				oc.columns(["userId", "teamId"]).doUpdateSet({
					leftAt: null,
					isMainTeam,
				}),
			)
			.execute();
	});
}

export function handleMemberLeaving({
	userId,
	teamId,
	newOwnerUserId,
}: {
	userId: number;
	teamId: number;
	newOwnerUserId?: number;
}) {
	return db.transaction().execute(async (trx) => {
		const currentTeams = await teamsByMemberUserId(userId, trx);

		const teamToLeave = currentTeams.find((team) => team.id === teamId);
		invariant(teamToLeave, "User is not a member of this team");
		invariant(
			!teamToLeave.isOwner || newOwnerUserId,
			"New owner id must be provided when old is leaving",
		);

		const wasMainTeam = teamToLeave.isMainTeam;
		const newMainTeam = currentTeams.find((team) => team.id !== teamId);
		if (wasMainTeam && newMainTeam) {
			await trx
				.updateTable("AllTeamMember")
				.set({
					isMainTeam: 1,
				})
				.where("userId", "=", userId)
				.where("teamId", "=", newMainTeam.id)
				.execute();
		}

		await trx
			.updateTable("AllTeamMember")
			.set({
				leftAt: databaseTimestampNow(),
				isMainTeam: 0,
				isOwner: 0,
				isManager: 0,
			})
			.where("userId", "=", userId)
			.where("teamId", "=", teamId)
			.execute();
		if (newOwnerUserId) {
			await trx
				.updateTable("AllTeamMember")
				.set({
					isOwner: 1,
					isManager: 0,
				})
				.where("userId", "=", newOwnerUserId)
				.where("teamId", "=", teamId)
				.execute();
		}
	});
}
