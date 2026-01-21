import type { MainWeaponId } from "~/modules/in-game-lists/types";
import weaponTranslations from "../../locales/en/weapons.json";
import { mySlugify } from "./urls";

const SLUG_TO_WEAPON_ID = Object.fromEntries(
	Object.entries(weaponTranslations)
		.filter(([id]) => id.startsWith("MAIN"))
		.map(([id, name]) => [
			mySlugify(name),
			Number(id.replace("MAIN_", "")) as MainWeaponId,
		]),
) as Record<string, MainWeaponId>;

export function weaponNameSlugToId(slug?: string) {
	if (!slug) return null;

	return SLUG_TO_WEAPON_ID[slug.toLowerCase()] ?? null;
}
