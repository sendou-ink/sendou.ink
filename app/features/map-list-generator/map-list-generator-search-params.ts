import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { MapPool } from "./core/map-pool";

// xxx: consider where we really need to support legacy
const presenceBoolean = z.codec(z.string(), z.boolean(), {
	// legacy decode fallback: bare `?readonly` (empty value) counts as true
	decode: (value) => value === "" || value === "true",
	encode: (value) => String(value),
});

export const mapListGeneratorSearchParams = SearchParams.define({
	pool: SP.param(z.string(), {
		default: MapPool.ANARCHY.serialized,
		resets: ["eventId"],
		loader: false,
	}),
	eventId: SP.param(z.number().int().positive().nullable(), {
		default: null,
		resets: ["pool"],
		loader: false,
	}),
	readonly: SP.custom(presenceBoolean, { default: false, loader: false }),
});
