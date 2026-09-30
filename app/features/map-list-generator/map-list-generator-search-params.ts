import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { MapPool } from "./core/map-pool";

export const mapListGeneratorSearchParams = SearchParams.define({
	pool: SP.param(v.string(), {
		default: MapPool.ANARCHY.serialized,
		resets: ["eventId"],
		loader: false,
	}),
	eventId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		resets: ["pool"],
		loader: false,
	}),
	readonly: SP.param(v.boolean(), { default: false, loader: false }),
});
