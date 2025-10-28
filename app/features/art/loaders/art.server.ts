import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import * as ArtRepository from "../ArtRepository.server";
import { FILTERED_TAG_KEY_SEARCH_PARAM_KEY } from "../art-constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const cachedArts = await cachified({
		key: "arts",
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			return {
				showcaseArts: await ArtRepository.findShowcaseArts(),
				recentlyUploadedArts: await ArtRepository.findRecentlyUploadedArts(),
				allTags: await ArtRepository.findAllTags(),
			};
		},
	});

	const filteredTagName = new URL(request.url).searchParams.get(
		FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
	);

	const filteredTag = filteredTagName
		? cachedArts.allTags.find((t) => t.name === filteredTagName)
		: null;

	if (!filteredTag) return cachedArts;

	return {
		...cachedArts,
		showcaseArts: await ArtRepository.findShowcaseArtsByTag(filteredTag.id),
	};
};
