import cachified from "@epic-web/cachified";
import { hoursToMilliseconds } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import { cache, ttl } from "~/utils/cache.server";
import * as ArtRepository from "../ArtRepository.server";
import { artSearchParams } from "../art-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const cachedArts = await cachified({
		key: "arts",
		cache,
		ttl: ttl(hoursToMilliseconds(2)),
		async getFreshValue() {
			return {
				showcaseArts: await ArtRepository.findShowcaseArts(),
				recentlyUploadedArts: await ArtRepository.findRecentlyUploadedArts(),
				allTags: await ArtRepository.findAllTags(),
			};
		},
	});

	const { tag: filteredTagName } = artSearchParams.parse(url);

	const filteredTag = filteredTagName
		? cachedArts.allTags.find((t) => t.name === filteredTagName)
		: null;

	if (!filteredTag) {
		return filteredTagName ? { ...cachedArts, showcaseArts: [] } : cachedArts;
	}

	return {
		...cachedArts,
		showcaseArts: await ArtRepository.findShowcaseArtsByTag(filteredTag.id),
	};
};
