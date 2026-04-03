import { cachified } from "@epic-web/cachified";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TrophyRepository from "../TrophyRepository.server";

const TROPHIES_CACHE_KEY = "trophies";

export type TrophiesLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const trophies = await cachified({
		key: TROPHIES_CACHE_KEY,
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			return TrophyRepository.all();
		},
	});

	return { trophies };
};

export function clearTrophiesCache() {
	cache.delete(TROPHIES_CACHE_KEY);
}
