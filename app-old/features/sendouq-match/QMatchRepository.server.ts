import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { ParsedMemento, Tables } from "~/db/tables";
import type { UserSkillDifference } from "~/db/types";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { COMMON_USER_FIELDS, userChatNameColor } from "~/utils/kysely.server";

export function findById(id: number) {
	return db
		.selectFrom("GroupMatch")
		.select(({ exists, selectFrom, eb }) => [
			"GroupMatch.id",
			"GroupMatch.alphaGroupId",
			"GroupMatch.bravoGroupId",
			"GroupMatch.createdAt",
			"GroupMatch.reportedAt",
			"GroupMatch.reportedByUserId",
			"GroupMatch.chatCode",
			"GroupMatch.memento",
			exists(
				selectFrom("Skill")
					.select("Skill.id")
					.where("Skill.groupMatchId", "=", id),
			).as("isLocked"),
			jsonArrayFrom(
				eb
					.selectFrom("GroupMatchMap")
					.select([
						"GroupMatchMap.id",
						"GroupMatchMap.mode",
						"GroupMatchMap.stageId",
						"GroupMatchMap.source",
						"GroupMatchMap.winnerGroupId",
					])
					.where("GroupMatchMap.matchId", "=", id)
					.orderBy("GroupMatchMap.index asc"),
			).as("mapList"),
		])
		.where("GroupMatch.id", "=", id)
		.executeTakeFirst();
}

export interface GroupForMatch {
	id: Tables["Group"]["id"];
	chatCode: Tables["Group"]["chatCode"];
	tier?: ParsedMemento["groups"][number]["tier"];
	skillDifference?: ParsedMemento["groups"][number]["skillDifference"];
	team?: {
		name: string;
		avatarUrl: string | null;
		customUrl: string;
	};
	members: Array<{
		id: Tables["GroupMember"]["userId"];
		discordId: Tables["User"]["discordId"];
		username: Tables["User"]["username"];
		discordAvatar: Tables["User"]["discordAvatar"];
		role: Tables["GroupMember"]["role"];
		customUrl: Tables["User"]["customUrl"];
		inGameName: Tables["User"]["inGameName"];
		weapons: Array<MainWeaponId>;
		chatNameColor: string | null;
		vc: Tables["User"]["vc"];
		languages: string[];
		skillDifference?: UserSkillDifference;
		friendCode?: string;
		privateNote: Pick<
			Tables["PrivateUserNote"],
			"sentiment" | "text" | "updatedAt"
		> | null;
	}>;
}

export async function findGroupById({
	loggedInUserId,
	groupId,
}: {
	groupId: number;
	loggedInUserId?: number;
}) {
	const row = await db
		.selectFrom("Group")
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
			"Group.chatCode",
			"GroupMatch.memento",
			jsonObjectFrom(
				eb
					.selectFrom("AllTeam")
					.leftJoin(
						"UserSubmittedImage",
						"AllTeam.avatarImgId",
						"UserSubmittedImage.id",
					)
					.select([
						"AllTeam.name",
						"AllTeam.customUrl",
						"UserSubmittedImage.url as avatarUrl",
					])
					.where("AllTeam.id", "=", eb.ref("Group.teamId")),
			).as("team"),
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.innerJoin("User", "User.id", "GroupMember.userId")
					.select((arrayEb) => [
						...COMMON_USER_FIELDS,
						"GroupMember.role",
						"User.inGameName",
						"User.vc",
						"User.languages",
						"User.qWeaponPool as weapons",
						arrayEb
							.selectFrom("UserFriendCode")
							.select("UserFriendCode.friendCode")
							.whereRef("UserFriendCode.userId", "=", "User.id")
							.orderBy("UserFriendCode.createdAt desc")
							.limit(1)
							.as("friendCode"),
						jsonObjectFrom(
							eb
								.selectFrom("PrivateUserNote")
								.select([
									"PrivateUserNote.sentiment",
									"PrivateUserNote.text",
									"PrivateUserNote.updatedAt",
								])
								.where("authorId", "=", loggedInUserId ?? -1)
								.where("targetId", "=", arrayEb.ref("User.id")),
						).as("privateNote"),
						userChatNameColor,
					])
					.where("GroupMember.groupId", "=", groupId)
					.orderBy("GroupMember.userId asc"),
			).as("members"),
		])
		.where("Group.id", "=", groupId)
		.executeTakeFirst();

	if (!row) return null;

	return {
		id: row.id,
		chatCode: row.chatCode,
		tier: row.memento?.groups[row.id]?.tier,
		skillDifference: row.memento?.groups[row.id]?.skillDifference,
		team: row.team,
		members: row.members.map((m) => ({
			...m,
			languages: m.languages ? m.languages.split(",") : [],
			plusTier: row.memento?.users[m.id]?.plusTier,
			skill: row.memento?.users[m.id]?.skill,
			skillDifference: row.memento?.users[m.id]?.skillDifference,
		})),
	} as GroupForMatch;
}

export function groupMembersNoScreenSettings(groups: GroupForMatch[]) {
	return db
		.selectFrom("User")
		.select("User.noScreen")
		.where(
			"User.id",
			"in",
			groups.flatMap((group) => group.members.map((member) => member.id)),
		)
		.execute();
}
