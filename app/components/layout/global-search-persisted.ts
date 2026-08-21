import * as v from "valibot";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { numericEnum } from "~/utils/schema";
import { GLOBAL_SEARCH_TYPES } from "./global-search-search-params";

const MAX_RECENT_WEAPONS = 5;

export const searchTypePersisted = PersistedState.define({
	key: "global-search-search-type",
	storage: "local",
	schema: v.picklist(GLOBAL_SEARCH_TYPES),
	default: "weapons",
});

export const recentWeaponsPersisted = PersistedState.define({
	key: "command-palette-recent-weapons",
	storage: "local",
	schema: v.array(numericEnum(mainWeaponIds)),
	default: [],
});

export function useRecentWeapons(): MainWeaponId[] {
	const [recentWeapons] = usePersistedState(recentWeaponsPersisted);

	return recentWeapons;
}

export function saveRecentWeapon(weaponId: MainWeaponId) {
	PersistedState.write(
		recentWeaponsPersisted,
		PersistedState.prependToRecentList(
			PersistedState.read(recentWeaponsPersisted),
			weaponId,
			MAX_RECENT_WEAPONS,
		),
	);
}
