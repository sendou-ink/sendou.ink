import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { divsCodec, timeRangeCodec } from "./scrims-schemas";

export const scrimsSearchParams = SearchParams.define({
	weekdayTimes: SP.custom(timeRangeCodec, { loader: true }),
	weekendTimes: SP.custom(timeRangeCodec, { loader: true }),
	divs: SP.custom(divsCodec, { loader: true }),
	pendingRequestPostId: SP.param(z.number().int().positive().nullable(), {
		loader: false,
	}),
});
