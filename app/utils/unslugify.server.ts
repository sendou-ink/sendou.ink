import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import weaponTranslations from "../../locales/en/weapons.json";
import { mySlugify } from "./urls";

function buildSlugToIdMap<T extends number>(prefix: string): Record<string, T> {
	return Object.fromEntries(
		Object.entries(weaponTranslations)
			.filter(([id]) => id.startsWith(`${prefix}_`))
			.map(([id, name]) => [
				mySlugify(name),
				Number(id.replace(`${prefix}_`, "")) as T,
			]),
	) as Record<string, T>;
}

const SLUG_TO_WEAPON_ID = buildSlugToIdMap<MainWeaponId>("MAIN");
const SLUG_TO_SUB_WEAPON_ID = buildSlugToIdMap<SubWeaponId>("SUB");
const SLUG_TO_SPECIAL_WEAPON_ID = buildSlugToIdMap<SpecialWeaponId>("SPECIAL");

export function weaponNameSlugToId(slug?: string) {
	if (!slug) return null;

	return SLUG_TO_WEAPON_ID[slug.toLowerCase()] ?? null;
}

export function subWeaponNameSlugToId(slug?: string) {
	if (!slug) return null;

	return SLUG_TO_SUB_WEAPON_ID[slug.toLowerCase()] ?? null;
}

export function specialWeaponNameSlugToId(slug?: string) {
	if (!slug) return null;

	return SLUG_TO_SPECIAL_WEAPON_ID[slug.toLowerCase()] ?? null;
}
