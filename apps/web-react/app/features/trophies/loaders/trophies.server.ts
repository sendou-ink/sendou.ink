import { cachified } from "@epic-web/cachified";
import { getUser } from "~/features/auth/core/user.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import * as TrophyRepository from "../TrophyRepository.server";
import { canAccessTrophies } from "../trophies-utils";

const TROPHIES_CACHE_KEY = "trophies";

export const loader = async () => {
	if (!canAccessTrophies(getUser())) {
		throw new Response(null, { status: 404 });
	}

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
