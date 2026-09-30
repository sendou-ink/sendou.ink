import * as v from "valibot";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/schema";

export const qSearchParams = SearchParams.define({
	join: SP.param(v.nullable(v.string()), { loader: true }),
});

export const qLookingSearchParams = SearchParams.define({
	preview: SP.param(v.boolean(), { default: false, loader: true }),
	joining: SP.param(v.boolean(), { default: false, loader: false }),
});

export const weaponUsageSearchParams = SearchParams.define({
	userId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	season: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))), {
		loader: true,
	}),
	stageId: SP.param(v.nullable(numericEnum(stageIds)), { loader: true }),
	modeShort: SP.param(v.nullable(modeShort), { loader: true }),
});
