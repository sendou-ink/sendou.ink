import * as v from "valibot";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { numericEnum } from "~/utils/schema";

const MAX_REPORTED_WEAPONS = 7;

export const recentlyReportedWeaponsPersisted = PersistedState.define({
	key: "sq__recently-reported-weapons",
	storage: "local",
	schema: v.array(numericEnum(mainWeaponIds)),
	default: [],
});

/**
 * This hook provides access to the list of recently reported weapons,
 * which is persisted in local storage, and a function to add a new weapon
 * to the list.
 *
 * If a weapon is added that already exists in the list, it will be moved to the front of the list.
 * If the list exceeds the maximum number of reported weapons, the oldest weapon will be removed.
 */
export function useRecentlyReportedWeapons() {
	const [recentlyReportedWeapons, setRecentlyReportedWeapons] =
		usePersistedState(recentlyReportedWeaponsPersisted);

	const addRecentlyReportedWeapon = (weapon: MainWeaponId) => {
		setRecentlyReportedWeapons((previous) =>
			PersistedState.prependToRecentList(
				previous,
				weapon,
				MAX_REPORTED_WEAPONS,
			),
		);
	};

	return { recentlyReportedWeapons, addRecentlyReportedWeapon };
}
