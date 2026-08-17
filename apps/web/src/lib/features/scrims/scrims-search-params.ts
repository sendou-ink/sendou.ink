import * as v from "valibot";
import * as SearchParams from "#lib/modules/search-params/search-params.ts";
import { SP } from "#lib/modules/search-params/search-params.ts";
import { divsCodec, timeRangeCodec } from "./scrims-schemas.ts";

export const scrimsSearchParams = SearchParams.define({
	weekdayTimes: SP.custom(timeRangeCodec, { default: null }),
	weekendTimes: SP.custom(timeRangeCodec, { default: null }),
	divs: SP.custom(divsCodec, { default: null }),
	/** False once the user has edited the filters, making the URL win over their saved defaults. */
	useDefaults: SP.param(v.boolean(), { default: true }),
	pendingRequestPostId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
		{},
	),
});
