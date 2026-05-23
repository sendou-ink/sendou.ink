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
			"User.weaponPool",
			"User.noScreen",
			"User.noSplatnet",
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

export async function updateMatchProfile({
	userId,
	mapModePreferences,
	vc,
	languages,
	weaponPool,
	noScreen,
	noSplatnet,
}: {
	userId: number;
	mapModePreferences: UserMapModePreferences;
	vc: Tables["User"]["vc"];
	languages: string[];
	weaponPool: WeaponPoolItem[];
	noScreen: number;
	noSplatnet: number;
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
			vc,
			languages: languages.length > 0 ? languages.join(",") : null,
			weaponPool:
				weaponPool.length > 0
					? JSON.stringify(
							weaponPool.map((wpn) => ({
								weaponSplId: wpn.id,
								isFavorite: Number(wpn.isFavorite),
							})),
						)
					: null,
			noScreen,
			noSplatnet,
		})
		.where("id", "=", userId)
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
