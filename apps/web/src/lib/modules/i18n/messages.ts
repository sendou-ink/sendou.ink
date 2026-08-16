import { m } from "#lib/paraglide/messages.js";

const messages = m as unknown as Record<
	string,
	((inputs?: Record<string, unknown>) => string) | undefined
>;

/**
 * Resolves a paraglide message by a dynamically built key (e.g. weapon names
 * keyed by id). Static call sites should always call the typed `m.*` functions
 * directly instead; this exists only for id-indexed message families.
 */
export function dynamicMessage(key: string): string {
	return messages[key]?.() ?? key;
}

/** Localized name of a main weapon. */
export function mainWeaponName(weaponSplId: number) {
	return dynamicMessage(`weapons_MAIN_${weaponSplId}`);
}

/** Localized name of a sub weapon. */
export function subWeaponName(subWeaponSplId: number) {
	return dynamicMessage(`weapons_SUB_${subWeaponSplId}`);
}

/** Localized name of a special weapon. */
export function specialWeaponName(specialWeaponSplId: number) {
	return dynamicMessage(`weapons_SPECIAL_${specialWeaponSplId}`);
}

/** Localized long name of a mode (e.g. "Splat Zones"). */
export function modeLongName(mode: string) {
	return dynamicMessage(`game_misc_MODE_LONG_${mode}`);
}

/** Localized stage name. */
export function stageName(stageId: number) {
	return dynamicMessage(`game_misc_STAGE_${stageId}`);
}

/** Localized weapon category name (e.g. "Shooters"). */
export function weaponCategoryName(category: string) {
	return dynamicMessage(`common_weapon_category_${category}`);
}
