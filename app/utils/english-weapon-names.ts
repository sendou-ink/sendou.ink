import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import englishWeaponNames from "../../locales/en/weapons.json";
import { mySlugify } from "./urls";

/** English name of the weapon, regardless of the language in-game names are shown in */
export function englishWeaponName(weapon: AnyWeapon): string {
	const key = `${weapon.type}_${weapon.id}`;

	return englishWeaponNames[key as keyof typeof englishWeaponNames];
}

/** URL slug of the weapon, always derived from its English name */
export function weaponSlug(weapon: AnyWeapon): string {
	return mySlugify(englishWeaponName(weapon));
}
