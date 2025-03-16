import type { MainWeaponId } from "~/modules/in-game-lists";
import weaponTranslations from "../../locales/en/weapons.json";
import { mySlugify } from "./urls";

export function weaponNameSlugToId(slug?: string) {
	if (!slug) return null;

	for (const [id, name] of Object.entries(weaponTranslations)) {
		if (!id.startsWith("MAIN")) continue;

		if (mySlugify(name) === slug.toLowerCase()) {
			return Number(id.replace("MAIN_", "")) as MainWeaponId;
		}
	}

	return null;
}
