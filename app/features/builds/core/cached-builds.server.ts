import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { cache, syncCached } from "~/utils/cache.server";
import { BUILDS_PAGE_MAX_BUILDS } from "../builds-constants";
import { buildsByWeaponId } from "../queries/buildsBy.server";

const buildsCacheKey = (weaponSplId: MainWeaponId) => `builds-${weaponSplId}`;

export function cachedBuildsByWeaponId(weaponSplId: MainWeaponId) {
	return syncCached(buildsCacheKey(weaponSplId), () =>
		buildsByWeaponId({
			weaponId: weaponSplId,
			limit: BUILDS_PAGE_MAX_BUILDS,
		}),
	);
}

export function refreshBuildsCacheByWeaponSplIds(weaponSplIds: MainWeaponId[]) {
	for (const weaponSplId of weaponSplIds) {
		cache.delete(buildsCacheKey(weaponSplId));
		cachedBuildsByWeaponId(weaponSplId);
	}
}
