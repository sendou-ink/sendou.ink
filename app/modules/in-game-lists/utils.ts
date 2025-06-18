import {
	allWeaponAltNames,
	weaponAltNames,
} from "~/modules/in-game-lists/weapon-alt-names";
import { abilities } from "./abilities";
import type { Ability, MainWeaponId } from "./types";

export function isAbility(value: string): value is Ability {
	return Boolean(abilities.some((a) => a.name === value));
}

const normalizeTerm = (term: string): string => {
	return term.trim().toLocaleLowerCase();
};

export function filterWeapon({
	weaponId,
	weaponName,
	searchTerm,
}: {
	weaponId: MainWeaponId;
	weaponName: string;
	searchTerm: string;
}): boolean {
	const normalizedSearchTerm = normalizeTerm(searchTerm);
	const normalizedWeaponName = normalizeTerm(weaponName);

	const isAlt = allWeaponAltNames.has(normalizedSearchTerm);
	if (isAlt) {
		return (
			weaponAltNames.get(weaponId)?.includes(normalizedSearchTerm) ?? false
		);
	}

	return normalizedWeaponName.includes(normalizedSearchTerm);
}
