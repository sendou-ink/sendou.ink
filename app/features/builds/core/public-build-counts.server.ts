import cachified from "@epic-web/cachified";
import { cache, ttl } from "~/utils/cache.server";
import * as BuildRepository from "../BuildRepository.server";

/** Public build count per canonical weapon id (alt skins folded), weapons without builds omitted. */
export function cachedPublicBuildCounts() {
	return cachified({
		key: "builds-index-build-counts",
		cache,
		ttl: ttl(Number.POSITIVE_INFINITY),
		getFreshValue: BuildRepository.countAllPublicByWeaponId,
	});
}
