import * as v from "valibot";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/schema";
import {
	PLANNER_BACKGROUND_STYLES,
	STAGE_WATER_LEVELS,
} from "./plans-constants";

export const plansSearchParams = SearchParams.define({
	stage: SP.param(numericEnum(stageIds), {
		default: stageIds[0],
		loader: false,
	}),
	mode: SP.param(modeShort, { default: "SZ", loader: false }),
	style: SP.param(v.picklist(PLANNER_BACKGROUND_STYLES), {
		default: "MINI",
		loader: false,
	}),
	water: SP.param(v.picklist(STAGE_WATER_LEVELS), {
		default: "up",
		loader: false,
	}),
	outlined: SP.param(v.boolean(), { default: false, loader: false }),
	ranges: SP.param(v.boolean(), { default: false, loader: false }),
	hideTop: SP.param(v.boolean(), { default: false, loader: false }),
	hideWeapons: SP.param(v.boolean(), { default: false, loader: false }),
});
