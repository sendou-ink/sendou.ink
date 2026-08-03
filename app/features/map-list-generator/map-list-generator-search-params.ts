import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { MapPool } from "./core/map-pool";

export const mapListGeneratorSearchParams = SearchParams.define({
	pool: SP.param(z.string(), {
		default: MapPool.ANARCHY.serialized,
		resets: ["eventId"],
		loader: false,
	}),
	eventId: SP.param(z.number().int().positive().nullable(), {
		resets: ["pool"],
		loader: false,
	}),
	readonly: SP.param(z.boolean(), { default: false, loader: false }),
});
