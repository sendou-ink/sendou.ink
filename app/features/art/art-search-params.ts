import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const ART_TABS = {
	RECENTLY_UPLOADED: "recently-uploaded",
	SHOWCASE: "showcase",
} as const;

export const artSearchParams = SearchParams.define({
	tag: SP.param(v.nullable(v.string()), { loader: true }),
	tab: SP.param(v.picklist([ART_TABS.RECENTLY_UPLOADED, ART_TABS.SHOWCASE]), {
		default: ART_TABS.RECENTLY_UPLOADED,
		loader: false,
	}),
	open: SP.param(v.boolean(), { default: false, loader: false }),
});

export const artGridSearchParams = SearchParams.define({
	big: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: false,
	}),
});

export const artNewSearchParams = SearchParams.define({
	art: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
});
