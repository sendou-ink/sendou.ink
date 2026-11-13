/**
 * Where a badge comes from: what it is awarded for (a tournament win, reaching an X Power or supporting on
 * Patreon, told apart by its code) and who drew it.
 */
import type { Tables } from "~/db/tables";
import { SPLATOON_3_XP_BADGE_VALUES } from "../badges-constants";

type AwardedFor = "PATRON" | "PATRON_PLUS" | "XP" | "TOURNAMENT";

const LEGACY_XP_BADGES_BY_DREAMY = [
	"XP3500 (Splatoon 3)",
	"XP4000 (Splatoon 3)",
	"XP4500 (Splatoon 3)",
	"XP5000 (Splatoon 3)",
];

/**
 * What the badge is awarded for, read from its code: `patreon` and `patreon_plus` are the supporter badges,
 * codes starting with `xp` (Splatoon 2) or one of {@link SPLATOON_3_XP_BADGE_VALUES} (Splatoon 3) are
 * X Power badges and every other badge is a tournament prize.
 */
export function awardedFor(badge: Pick<Tables["Badge"], "code">): AwardedFor {
	if (badge.code === "patreon") return "PATRON";
	if (badge.code === "patreon_plus") return "PATRON_PLUS";
	if (
		badge.code.startsWith("xp") ||
		SPLATOON_3_XP_BADGE_VALUES.some((value) => String(value) === badge.code)
	) {
		return "XP";
	}

	return "TOURNAMENT";
}

/**
 * The Splatoon 3 X Power badge a peak X Power earns: the highest of {@link SPLATOON_3_XP_BADGE_VALUES} it reaches,
 * `null` below the lowest one. A player holds only this one XP badge, not the ones under it.
 */
export function xpBadgeValue(peakXp: number) {
	for (const value of SPLATOON_3_XP_BADGE_VALUES) {
		if (peakXp >= value) {
			return value;
		}
	}

	return null;
}

/**
 * Who drew a legacy badge, one made before badges had an author (`Badge.authorId` being `null`): Dreamy drew
 * the top Splatoon 3 XP badges, borzoic the rest.
 */
export function legacyMakerName(badge: Pick<Tables["Badge"], "displayName">) {
	if (LEGACY_XP_BADGES_BY_DREAMY.includes(badge.displayName)) {
		return "Dreamy";
	}

	return "borzoic";
}
