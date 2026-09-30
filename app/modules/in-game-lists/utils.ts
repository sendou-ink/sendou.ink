import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import { weaponAltNames } from "~/modules/in-game-lists/weapon-alt-names";
import { abilities } from "./abilities";
import type { Ability } from "./types";

export function isAbility(value: string): value is Ability {
	return Boolean(abilities.some((a) => a.name === value));
}

const normalizeTerm = (term: string): string => {
	return term
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]/gu, "")
		.toLocaleLowerCase();
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

	if (normalizedWeaponName.includes(normalizedSearchTerm)) {
		return true;
	}

	if (weapon.type === "MAIN") {
		const altNames = weaponAltNames.get(weapon.id);
		if (!altNames) return false;

		const altNamesList = typeof altNames === "string" ? [altNames] : altNames;

		return altNamesList.includes(normalizedSearchTerm);
	}

	return false;
}
