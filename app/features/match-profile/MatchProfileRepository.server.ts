import * as R from "remeda";
import { db } from "~/db/sql";
import type { DBBoolean, Tables } from "~/db/tables";
import type { UserMapModePreferences } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { modesShort } from "~/modules/in-game-lists/modes";
import { matchProfileWeapons } from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";

export function findSettingsByUserId(userId: number) {
	return db
		.selectFrom("User")
		.select(({ eb }) => [
			"User.mapModePreferences",
			"User.vc",
			"User.languages",
			"User.noScreen",
			matchProfileWeapons(eb).as("weaponPool"),
		])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();
}

export async function updateOwnMatchProfile({
	mapModePreferences,
	vc,
	languages,
	weaponPool,
	noScreen,
}: {
	mapModePreferences: UserMapModePreferences;
	vc: Tables["User"]["vc"];
	languages: UnifiedLanguageCode[];
	weaponPool: WeaponPoolItem[];
	noScreen: DBBoolean;
}) {
	const userId = actorId();
	const current = await db
		.selectFrom("User")
		.select(["mapModePreferences", "noScreen"])
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	const mergedPool = mergeExcludedModePreferences(
		mapModePreferences.pool,
		current.mapModePreferences?.pool,
	);

	const newMapModePreferences: UserMapModePreferences = {
		...mapModePreferences,
		pool: mergedPool,
	};

	const mapModePreferencesChanged = !R.isDeepEqual(
		newMapModePreferences,
		current.mapModePreferences,
	);
	const noScreenChanged = current.noScreen !== noScreen;

	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("UserWeaponPool")
			.where("userId", "=", userId)
			.execute();

		await trx
			.insertInto("UserWeaponPool")
			.values(
				weaponPool.map((wpn, i) => ({
					userId,
					sortOrder: i,
					weaponSplId: wpn.id,
					isFavorite: toDBBoolean(wpn.isFavorite),
				})),
			)
			.execute();

		await trx
			.updateTable("User")
			.set({
				mapModePreferences: JSON.stringify(newMapModePreferences),
				vc,
				languages: languages.length > 0 ? JSON.stringify(languages) : null,
				noScreen,
			})
			.where("id", "=", userId)
			.execute();
	});

	return { mapModePreferencesChanged, noScreenChanged };
}

/** Keeps preferences of modes left out of the submission, so their maps are remembered when the mode is played again. */
export function mergeExcludedModePreferences(
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
