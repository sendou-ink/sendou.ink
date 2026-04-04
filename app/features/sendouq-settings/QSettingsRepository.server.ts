import { db } from "~/db/sql";
import type { Tables, UserMapModePreferences } from "~/db/tables";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { modesShort } from "~/modules/in-game-lists/modes";

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
		languages: preferences.languages?.split(",") as
			| UnifiedLanguageCode[]
			| undefined,
	};
}

export async function updateUserMapModePreferences({
	userId,
	mapModePreferences,
}: {
	userId: number;
	mapModePreferences: UserMapModePreferences;
}) {
	const currentPreferences = (
		await db
			.selectFrom("User")
			.select("mapModePreferences")
			.where("id", "=", userId)
			.executeTakeFirstOrThrow()
	).mapModePreferences;

	const mergedPool = mergeExcludedModePreferences(
		mapModePreferences.pool,
		currentPreferences?.pool,
	);

	return db
		.updateTable("User")
		.set({
			mapModePreferences: JSON.stringify({
				...mapModePreferences,
				pool: mergedPool,
			}),
		})
		.where("id", "=", userId)
		.execute();
}

export async function updateTeamMapModePreferences({
	teamId,
	mapModePreferences,
}: {
	teamId: number;
	mapModePreferences: UserMapModePreferences;
}) {
	const currentPreferences = (
		await db
			.selectFrom("AllTeam")
			.select("mapModePreferences")
			.where("id", "=", teamId)
			.executeTakeFirstOrThrow()
	).mapModePreferences;

	const mergedPool = mergeExcludedModePreferences(
		mapModePreferences.pool,
		currentPreferences?.pool,
	);

	return db
		.updateTable("AllTeam")
		.set({
			mapModePreferences: JSON.stringify({
				...mapModePreferences,
				pool: mergedPool,
			}),
		})
		.where("id", "=", teamId)
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
	weaponPool: WeaponPoolItem[];
}) {
	return db
		.updateTable("User")
		.set({
			qWeaponPool:
				args.weaponPool.length > 0
					? JSON.stringify(
							args.weaponPool.map((wpn) => ({
								weaponSplId: wpn.id,
								isFavorite: Number(wpn.isFavorite),
							})),
						)
					: null,
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

/**
 * Preserves existing preferences for modes not included in the new submission.
 * So if they later want to play this mode again, the system remembers their maps.
 */
function mergeExcludedModePreferences(
	newPool: UserMapModePreferences["pool"],
	currentPool: UserMapModePreferences["pool"] | undefined,
) {
	const modesExcluded = modesShort.filter(
		(mode) => !newPool.some((mp) => mp.mode === mode),
	);

	const preservedPreferences = modesExcluded.flatMap(
		(mode) => currentPool?.filter((mp) => mp.mode === mode) ?? [],
	);

	return [...newPool, ...preservedPreferences];
}
