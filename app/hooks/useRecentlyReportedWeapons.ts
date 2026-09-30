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

/** Local storage list of recently reported weapons; adding moves to the front and caps the length. */
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
