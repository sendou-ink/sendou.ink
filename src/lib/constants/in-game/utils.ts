import { abilities } from './abilities';
import type { Ability, AnyWeapon } from './types';
import { allWeaponAltNames, weaponAltNames } from './weapon-alt-names';

export function isAbility(value: string): value is Ability {
	return Boolean(abilities.some((a) => a.name === value));
}

function normalizeTerm(term: string) {
	return term.trim().toLocaleLowerCase();
}

export function filterWeapon({
	weapon,
	weaponName,
	searchTerm
}: {
	weapon: AnyWeapon;
	weaponName: string;
	searchTerm: string;
}): boolean {
	const normalizedSearchTerm = normalizeTerm(searchTerm);
	const normalizedWeaponName = normalizeTerm(weaponName);

	const isAlt = allWeaponAltNames.has(normalizedSearchTerm);
	if (weapon.type === 'MAIN' && isAlt) {
		return weaponAltNames.get(weapon.id)?.includes(normalizedSearchTerm) ?? false;
	}

	return normalizedWeaponName.includes(normalizedSearchTerm);
}
