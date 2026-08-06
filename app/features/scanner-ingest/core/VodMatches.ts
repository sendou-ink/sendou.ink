import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { IngestVodMatchInput } from "../scanner-ingest-vod-schemas";

export interface PrefillVodMatch {
	startsAt: number;
	mode: ModeShort | null;
	stageId: StageId | null;
	weapons: (MainWeaponId | null)[];
	/** the POV player's weapon, when the scan identified their seat */
	povWeapon: MainWeaponId | null;
}

/**
 * Turns the per-match rows a scanner VoD scan sends into prefill data for the
 * /vods/new form. The rows already carry sendou ids (validated by
 * ingestVodPrefillSchema); this only renames fields into the form's shape.
 */
export function prefillVodMatches(
	matches: IngestVodMatchInput[],
): PrefillVodMatch[] {
	return matches.map((match) => ({
		startsAt: match.startsAt,
		mode: match.mode,
		stageId: match.stage,
		weapons: match.weapons,
		povWeapon: match.povWeapon ?? null,
	}));
}
