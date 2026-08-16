import type { MapPool } from "@sendou/map-list-generator/map-pool";
import { MAPS_URL } from "~/utils/urls";
import { mapListGeneratorSearchParams } from "./map-list-generator-search-params";

export const mapsPageWithMapPool = (mapPool: MapPool) =>
	mapListGeneratorSearchParams.href(MAPS_URL, {
		readonly: true,
		pool: mapPool.serialized,
	});
