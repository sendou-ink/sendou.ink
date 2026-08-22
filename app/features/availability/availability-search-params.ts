import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const scheduleWeekSearchParams = SearchParams.define({
	week: SP.param(v.picklist(["current", "next"]), {
		default: "current",
		loader: false,
	}),
});
