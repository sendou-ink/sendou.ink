import type { AnyWeapon } from "~/features/build-analyzer";
import {
	allWeaponAltNames,
	weaponAltNames,
} from "~/modules/in-game-lists/weapon-alt-names";
import { abilities } from "./abilities";
import type { Ability } from "./types";

export function isAbility(value: string): value is Ability {
	return Boolean(abilities.some((a) => a.name === value));
}

const normalizeTerm = (term: string): string => {
	return term.trim().toLocaleLowerCase();
};

export function filterWeapon({
	weapon,
	weaponName,
	searchTerm,
}: {
	weapon: AnyWeapon;
	weaponName: string;
	searchTerm: string;
}): boolean {
	const normalizedSearchTerm = normalizeTerm(searchTerm);
	const normalizedWeaponName = normalizeTerm(weaponName);

	const isAlt = allWeaponAltNames.has(normalizedSearchTerm);
	if (weapon.type === "MAIN" && isAlt) {
		return (
			weaponAltNames.get(weapon.id)?.includes(normalizedSearchTerm) ?? false
		);
	}

	return normalizedWeaponName.includes(normalizedSearchTerm);
}
