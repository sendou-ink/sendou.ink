import { MAPS_URL } from "~/utils/urls";
import type { MapPool } from "./core/map-pool";
import { mapListGeneratorSearchParams } from "./map-list-generator-search-params";

export const mapsPageWithMapPool = (mapPool: MapPool) =>
	mapListGeneratorSearchParams.href(MAPS_URL, {
		readonly: true,
		pool: mapPool.serialized,
	});
