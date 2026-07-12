import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { IngestVodMatchInput } from "../ingest-vod-schemas";
import {
	MAIN_WEAPON_IDS,
	MODE_SHORT_BY_ENGLISH_NAME,
	STAGE_ID_BY_ENGLISH_NAME,
} from "./game-names";

export interface ResolvedVodMatch {
	startsAt: number;
	mode: ModeShort;
	stageId: StageId;
	weapons: MainWeaponId[];
}

/**
 * Turns the raw per-match rows an emberz VoD scan sends into insertable
 * VideoMatch data: the English mode/stage names are resolved to sendou.ink
 * ids and the weapon-id strings validated. A match is dropped when its mode or
 * stage did not read to a known value, or when it does not carry exactly
 * `teamSize * 2` weapons that all resolve to real main weapons (an OCR miss on
 * any weapon leaves the match incomplete — better to skip it than show a hole).
 */
export function resolveVodMatches({
	matches,
	teamSize,
}: {
	matches: IngestVodMatchInput[];
	teamSize: number;
}): { resolved: ResolvedVodMatch[]; skippedCount: number } {
	const expectedWeaponCount = teamSize * 2;
	const resolved: ResolvedVodMatch[] = [];
	let skippedCount = 0;

	for (const match of matches) {
		const mode = match.mode
			? MODE_SHORT_BY_ENGLISH_NAME.get(match.mode)
			: undefined;
		const stageId = match.stage
			? STAGE_ID_BY_ENGLISH_NAME.get(match.stage)
			: undefined;
		if (mode === undefined || stageId === undefined) {
			skippedCount++;
			continue;
		}

		const weapons = resolveWeapons(match.weapons);
		if (weapons === null || weapons.length !== expectedWeaponCount) {
			skippedCount++;
			continue;
		}

		resolved.push({ startsAt: match.startsAt, mode, stageId, weapons });
	}

	return { resolved, skippedCount };
}

export interface PrefillVodMatch {
	startsAt: number;
	mode: ModeShort | null;
	stageId: StageId | null;
	weapons: (MainWeaponId | null)[];
}

/**
 * Lenient variant of resolveVodMatches for prefilling the /vods/new form:
 * no match is dropped — a mode, stage, or weapon that did not resolve becomes
 * null and is left for the user to fill in the form.
 */
export function prefillVodMatches(
	matches: IngestVodMatchInput[],
): PrefillVodMatch[] {
	return matches.map((match) => ({
		startsAt: match.startsAt,
		mode:
			(match.mode ? MODE_SHORT_BY_ENGLISH_NAME.get(match.mode) : undefined) ??
			null,
		stageId:
			(match.stage ? STAGE_ID_BY_ENGLISH_NAME.get(match.stage) : undefined) ??
			null,
		weapons: match.weapons.map((weapon) => {
			const id = Number(weapon);
			return Number.isInteger(id) && MAIN_WEAPON_IDS.has(id)
				? (id as MainWeaponId)
				: null;
		}),
	}));
}

/** Returns the weapons as main weapon ids, or null if any did not resolve. */
function resolveWeapons(weapons: string[]): MainWeaponId[] | null {
	const result: MainWeaponId[] = [];
	for (const weapon of weapons) {
		const id = Number(weapon);
		if (!Number.isInteger(id) || !MAIN_WEAPON_IDS.has(id)) return null;
		result.push(id as MainWeaponId);
	}
	return result;
}
