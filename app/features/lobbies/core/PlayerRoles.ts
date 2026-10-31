/**
 * Role tags of a player (Tacticooler, backline) from their weapon pool, which `TeamShuffle` spreads
 * evenly across the teams.
 */
import { hasTacticooler } from "~/features/img-export/core/RunComps";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as WeaponRoll from "./WeaponRoll";

/**
 * Roles that `TeamShuffle` spreads across the teams. `TACTICOOLER` and `BACKLINE` make a team lopsided when
 * stacked on one side, `BACKLINE_IN_POOL` players can fill the backline so each team should get one.
 */
export type PlayerRole = "TACTICOOLER" | "BACKLINE" | "BACKLINE_IN_POOL";

/** Share of the weapon pool needing the trait for the player to be tagged, "mostly" = more than half */
const ROLE_POOL_SHARE_THRESHOLD = 0.5;

/**
 * Role tags of a player derived from their match profile weapon pool: `TACTICOOLER` if the pool is mostly
 * Tacticooler kits, `BACKLINE` if mostly backline weapons (see `WeaponRoll.tierOf`) and `BACKLINE_IN_POOL` if it has any.
 * An empty pool has no roles.
 */
export function fromWeaponPool(weaponPool: MainWeaponId[]): PlayerRole[] {
	if (weaponPool.length === 0) return [];

	const roles: PlayerRole[] = [];

	if (isMostly(weaponPool, hasTacticooler)) roles.push("TACTICOOLER");
	if (isMostly(weaponPool, isBackline)) roles.push("BACKLINE");
	if (weaponPool.some(isBackline)) roles.push("BACKLINE_IN_POOL");

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

function isBackline(weaponSplId: MainWeaponId) {
	return WeaponRoll.tierOf(weaponSplId) === "BACKLINE";
}
