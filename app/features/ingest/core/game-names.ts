import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import gameMisc from "../../../../locales/en/game-misc.json";

/**
 * Maps the English mode/stage names emberz produces (its closed-set snapping
 * emits exactly the names in locales/en/game-misc.json) to sendou.ink's
 * internal ids. Shared by the scoreboard matcher and the /ingest/vod builder.
 */
export const STAGE_ID_BY_ENGLISH_NAME = new Map<string, StageId>(
	stageIds.map((stageId) => [
		(gameMisc as Record<string, string>)[`STAGE_${stageId}`]!,
		stageId,
	]),
);

export const MODE_SHORT_BY_ENGLISH_NAME = new Map<string, ModeShort>(
	modesShort.map((modeShort) => [
		(gameMisc as Record<string, string>)[`MODE_LONG_${modeShort}`]!,
		modeShort,
	]),
);

export const MAIN_WEAPON_IDS: ReadonlySet<number> = new Set(mainWeaponIds);
