import { cachified } from "@epic-web/cachified";
import { hoursToMilliseconds } from "date-fns";
import * as R from "remeda";
import { cache, ttl } from "~/utils/cache.server";
import * as XpTrophy from "../core/XpTrophy";
import * as TrophyRepository from "../TrophyRepository.server";

const TROPHIES_CACHE_KEY = "trophies";

export const loader = async () => {
	const trophies = await cachified({
		key: TROPHIES_CACHE_KEY,
		cache,
		ttl: ttl(hoursToMilliseconds(2)),
		async getFreshValue() {
			return TrophyRepository.all();
		},
	});
	const xpTrophies = await TrophyRepository.findAllXp();

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
