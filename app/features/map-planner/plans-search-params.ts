import * as v from "valibot";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/schema";
import {
	PLAN_URL_PARAM_MAX_LENGTH,
	PLANNER_BACKGROUND_STYLES,
	STAGE_WATER_LEVELS,
} from "./plans-constants";

/** What a link opens the planner with, read once when it opens and then removed from the URL. */
export const plansSearchParams = SearchParams.define({
	/** A whole plan, `PlanEncoding.toUrlParam` */
	plan: SP.param(
		v.nullable(v.pipe(v.string(), v.maxLength(PLAN_URL_PARAM_MAX_LENGTH))),
		{ loader: false },
	),
	/** With `mode`, an empty plan on that map */
	stage: SP.param(v.nullable(numericEnum(stageIds)), { loader: false }),
	mode: SP.param(v.nullable(modeShort), { loader: false }),
});

// XXX: delete with the tldraw planner
export const tldrawPlansSearchParams = SearchParams.define({
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
	/** PlanImport handoff key: the planner claims this plan on load */
	import: SP.param(v.nullable(v.pipe(v.string(), v.maxLength(100))), {
		loader: false,
	}),
});
