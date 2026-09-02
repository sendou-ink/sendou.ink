/**
 * Main-weapon kits (sub + special ids) keyed by main weapon id, derived from
 * sendou.ink's weapon params. Ids match assets/cv/specials and
 * assets/cv/sub-weapons; used to disambiguate near-tied weapon icons by kit.
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
