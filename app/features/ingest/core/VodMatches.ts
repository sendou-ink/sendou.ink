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

export interface PrefillVodMatch {
	startsAt: number;
	mode: ModeShort | null;
	stageId: StageId | null;
	weapons: (MainWeaponId | null)[];
}

/**
 * Turns the raw per-match rows an emberz VoD scan sends into prefill data for
 * the /vods/new form: the English mode/stage names are resolved to sendou.ink
 * ids and the weapon ids validated. No match is dropped — a mode, stage, or
 * weapon that did not resolve becomes null and is left for the user to fill in
 * the form.
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
		weapons: match.weapons.map((weapon) =>
			weapon !== null && MAIN_WEAPON_IDS.has(weapon)
				? (weapon as MainWeaponId)
				: null,
		),
	}));
}
