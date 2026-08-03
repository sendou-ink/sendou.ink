import { z } from "zod";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { modeShort, numericEnum } from "~/utils/zod";

export const qSearchParams = SearchParams.define({
	join: SP.param(z.string().nullable(), { loader: true }),
});

export const qLookingSearchParams = SearchParams.define({
	preview: SP.param(z.boolean(), { default: false, loader: true }),
	joining: SP.param(z.boolean(), { default: false, loader: false }),
});

export const weaponUsageSearchParams = SearchParams.define({
	userId: SP.param(z.number().int().positive().nullable(), { loader: true }),
	season: SP.param(z.number().int().nonnegative().nullable(), { loader: true }),
	stageId: SP.param(numericEnum(stageIds).nullable(), { loader: true }),
	modeShort: SP.param(modeShort.nullable(), { loader: true }),
});
