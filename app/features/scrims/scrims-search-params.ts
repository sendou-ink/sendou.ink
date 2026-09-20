import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { divsCodec, timeRangeCodec } from "./scrims-schemas";

export const scrimsSearchParams = SearchParams.define({
	weekdayTimes: SP.custom(timeRangeCodec, { loader: true }),
	weekendTimes: SP.custom(timeRangeCodec, { loader: true }),
	divs: SP.custom(divsCodec, { loader: true }),
	/** False once the user has edited the filters, making the URL win over their saved defaults. */
	useDefaults: SP.param(v.boolean(), { default: true, loader: true }),
	/** Only posts whose visibility ever mentioned this association, not part of the saved default filters. */
	associationId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{ loader: true },
	),
	pendingRequestPostId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{
			loader: false,
		},
	),
});
