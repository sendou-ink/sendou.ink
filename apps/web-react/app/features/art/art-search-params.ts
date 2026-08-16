import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const ART_TABS = {
	RECENTLY_UPLOADED: "recently-uploaded",
	SHOWCASE: "showcase",
} as const;

export const artSearchParams = SearchParams.define({
	tag: SP.param(z.string().nullable(), { loader: true }),
	tab: SP.param(z.enum([ART_TABS.RECENTLY_UPLOADED, ART_TABS.SHOWCASE]), {
		default: ART_TABS.RECENTLY_UPLOADED,
		loader: false,
	}),
	open: SP.param(z.boolean(), { default: false, loader: false }),
});

export const artGridSearchParams = SearchParams.define({
	big: SP.param(z.number().int().positive().nullable(), { loader: false }),
});

export const artNewSearchParams = SearchParams.define({
	art: SP.param(z.number().int().positive().nullable(), { loader: true }),
});
