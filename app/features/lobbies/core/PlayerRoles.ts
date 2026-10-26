/**
 * Role tags of a player (Tacticooler, backline) from their weapon pool, which `TeamShuffle` spreads
 * evenly across the teams.
 */
import * as WeaponRange from "~/features/comp-analyzer/core/WeaponRange";
import { hasTacticooler } from "~/features/img-export/core/RunComps";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

/** Roles that make a team lopsided when stacked on one side, see `TeamShuffle`. */
export type PlayerRole = "TACTICOOLER" | "BACKLINE";

/** Share of the weapon pool needing the trait for the player to be tagged, "mostly" = more than half */
export const ROLE_POOL_SHARE_THRESHOLD = 0.5;

/** Range from which a weapon counts as backline. Splatana Stamper (20.8) is just below, Jet Squelcher (21.1) just above. */
export const BACKLINE_MIN_RANGE = 21;

/**
 * Role tags of a player derived from their match profile weapon pool: `TACTICOOLER` if the pool is mostly
 * Tacticooler kits, `BACKLINE` if mostly long range weapons. An empty pool has no roles.
 */
export function fromWeaponPool(weaponPool: MainWeaponId[]): PlayerRole[] {
	if (weaponPool.length === 0) return [];

	const roles: PlayerRole[] = [];

	if (isMostly(weaponPool, hasTacticooler)) roles.push("TACTICOOLER");
	if (isMostly(weaponPool, isBackline)) roles.push("BACKLINE");

	return roles;
}

function isMostly(
	weaponPool: MainWeaponId[],
	predicate: (weaponSplId: MainWeaponId) => boolean,
) {
	return (
		weaponPool.filter(predicate).length / weaponPool.length >
		ROLE_POOL_SHARE_THRESHOLD
	);
}

const isBacklineCache = new Map<MainWeaponId, boolean>();
function isBackline(weaponSplId: MainWeaponId) {
	const cached = isBacklineCache.get(weaponSplId);
	if (cached !== undefined) return cached;

	// range is simulated from the weapon's params, so worth computing once
	const result =
		WeaponRange.ofMainWeapon(weaponSplId).range >= BACKLINE_MIN_RANGE;
	isBacklineCache.set(weaponSplId, result);

	return result;
}
