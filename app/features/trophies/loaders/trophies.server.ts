import { cachified } from "@epic-web/cachified";
import * as R from "remeda";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import * as XpTrophy from "../core/XpTrophy";
import * as TrophyRepository from "../TrophyRepository.server";

const TROPHIES_CACHE_KEY = "trophies";

export const loader = async () => {
	const [trophies, xpTrophies] = await Promise.all([
		cachified({
			key: TROPHIES_CACHE_KEY,
			cache,
			ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
			async getFreshValue() {
				return TrophyRepository.all();
			},
		}),
		TrophyRepository.findAllXp(),
	]);

	return {
		trophies,
		xpTrophies: R.sortBy(xpTrophies, (trophy) =>
			XpTrophy.VARIANTS.findIndex((variant) => variant.code === trophy.code),
		),
	};
};

export function clearTrophiesCache() {
	cache.delete(TROPHIES_CACHE_KEY);
}
