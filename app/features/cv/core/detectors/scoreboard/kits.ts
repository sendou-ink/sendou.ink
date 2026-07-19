/**
 * Main-weapon kits (sub + special ids) keyed by in-game main weapon id,
 * derived directly from sendou.ink's weapon params (no generated copy).
 * Special ids match assets/cv/specials/<id>.png; the results scoreboard
 * shows each player's special icon above the specials counter, which lets
 * near-tied weapon icon matches be disambiguated by kit. The minimap's
 * sub-tile disambiguation (assets/cv/sub-weapons) reads `sub` the same way.
 */
import { weaponParams } from "~/features/build-analyzer/data/weapon-params";
import type {
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";

export interface WeaponKit {
	/** sendou.ink sub weapon id */
	sub: SubWeaponId;
	/** sendou.ink special weapon id, matching assets/cv/specials */
	special: SpecialWeaponId;
}

export const WEAPON_KITS: ReadonlyMap<string, WeaponKit> = new Map(
	Object.entries(weaponParams.weaponKits).map(([id, kit]) => [
		id,
		{
			sub: kit.subWeaponId as SubWeaponId,
			special: kit.specialWeaponId as SpecialWeaponId,
		},
	]),
);
