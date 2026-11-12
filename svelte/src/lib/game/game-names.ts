import type {
	ModeShortWithSpecial,
	StageId,
} from "~/modules/in-game-lists/types";
import { m } from "#lib/paraglide/messages.js";

// listed one by one, not looked up by a built key, so that only these messages are bundled
const STAGE_NAMES: Record<StageId, () => string> = {
	0: m.game_misc_STAGE_0,
	1: m.game_misc_STAGE_1,
	2: m.game_misc_STAGE_2,
	3: m.game_misc_STAGE_3,
	4: m.game_misc_STAGE_4,
	5: m.game_misc_STAGE_5,
	6: m.game_misc_STAGE_6,
	7: m.game_misc_STAGE_7,
	8: m.game_misc_STAGE_8,
	9: m.game_misc_STAGE_9,
	10: m.game_misc_STAGE_10,
	11: m.game_misc_STAGE_11,
	12: m.game_misc_STAGE_12,
	13: m.game_misc_STAGE_13,
	14: m.game_misc_STAGE_14,
	15: m.game_misc_STAGE_15,
	16: m.game_misc_STAGE_16,
	17: m.game_misc_STAGE_17,
	18: m.game_misc_STAGE_18,
	19: m.game_misc_STAGE_19,
	20: m.game_misc_STAGE_20,
	21: m.game_misc_STAGE_21,
	22: m.game_misc_STAGE_22,
	23: m.game_misc_STAGE_23,
	24: m.game_misc_STAGE_24,
};

const MODE_LONG_NAMES: Record<ModeShortWithSpecial, () => string> = {
	TW: m.game_misc_MODE_LONG_TW,
	SZ: m.game_misc_MODE_LONG_SZ,
	TC: m.game_misc_MODE_LONG_TC,
	RM: m.game_misc_MODE_LONG_RM,
	CB: m.game_misc_MODE_LONG_CB,
	TB: m.game_misc_MODE_LONG_TB,
	SR: m.game_misc_MODE_LONG_SR,
};

/** The stage's name in the current language. */
export function stageName(stageId: StageId) {
	return STAGE_NAMES[stageId]();
}

/** The mode's full name (e.g. Splat Zones) in the current language. */
export function modeLongName(mode: ModeShortWithSpecial) {
	return MODE_LONG_NAMES[mode]();
}
