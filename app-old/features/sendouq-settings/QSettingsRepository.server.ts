import { db } from "~/db/sql";
import type { Tables, UserMapModePreferences } from "~/db/tables";
import { type MainWeaponId, modesShort } from "~/modules/in-game-lists";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

export async function settingsByUserId(userId: number) {
	const preferences = await db
		.selectFrom("User")
		.select([
			"User.mapModePreferences",
			"User.vc",
			"User.languages",
			"User.qWeaponPool",
			"User.noScreen",
		])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	return {
		...preferences,
		languages: preferences.languages?.split(","),
	};
}

export async function updateUserMapModePreferences({
	userId,
	mapModePreferences,
}: {
	userId: number;
	mapModePreferences: UserMapModePreferences;
}) {
	const modesExcluded = modesShort.filter(
		(mode) => !mapModePreferences.pool.some((mp) => mp.mode === mode),
	);

	const currentPreferences = (
		await db
			.selectFrom("User")
			.select("mapModePreferences")
			.where("id", "=", userId)
			.executeTakeFirstOrThrow()
	).mapModePreferences;

	for (const mode of modesExcluded) {
		const previousModePreference = currentPreferences?.pool.filter(
			(mp) => mp.mode === mode,
		);
		if (previousModePreference && previousModePreference.length > 0) {
			mapModePreferences.pool.push(...previousModePreference);
		}
	}

	return db
		.updateTable("User")
		.set({ mapModePreferences: JSON.stringify(mapModePreferences) })
		.where("id", "=", userId)
		.execute();
}

export function updateVoiceChat(args: {
	userId: number;
	vc: Tables["User"]["vc"];
	languages: string[];
}) {
	return db
		.updateTable("User")
		.set({
			vc: args.vc,
			languages: args.languages.length > 0 ? args.languages.join(",") : null,
		})
		.where("User.id", "=", args.userId)
		.execute();
}

export function updateSendouQWeaponPool(args: {
	userId: number;
	weaponPool: MainWeaponId[];
}) {
	return db
		.updateTable("User")
		.set({
			qWeaponPool:
				args.weaponPool.length > 0 ? JSON.stringify(args.weaponPool) : null,
		})
		.where("User.id", "=", args.userId)
		.execute();
}

export function updateNoScreen({
	noScreen,
	userId,
}: {
	noScreen: number;
	userId: number;
}) {
	return db
		.updateTable("User")
		.set({
			noScreen,
		})
		.where("User.id", "=", userId)
		.execute();
}

export function currentTeamByUserId(userId: number) {
	return db
		.selectFrom("TeamMember")
		.innerJoin("Team", "Team.id", "TeamMember.teamId")
		.select(["Team.name"])
		.where("TeamMember.userId", "=", userId)
		.executeTakeFirst();
}

export function findTrustedUsersByGiverId(trustGiverUserId: number) {
	return db
		.selectFrom("TrustRelationship")
		.innerJoin("User", "User.id", "TrustRelationship.trustReceiverUserId")
		.select(COMMON_USER_FIELDS)
		.where("TrustRelationship.trustGiverUserId", "=", trustGiverUserId)
		.execute();
}

export function deleteTrustedUser({
	trustGiverUserId,
	trustReceiverUserId,
}: {
	trustGiverUserId: number;
	trustReceiverUserId: number;
}) {
	return db
		.deleteFrom("TrustRelationship")
		.where("TrustRelationship.trustGiverUserId", "=", trustGiverUserId)
		.where("TrustRelationship.trustReceiverUserId", "=", trustReceiverUserId)
		.execute();
}
