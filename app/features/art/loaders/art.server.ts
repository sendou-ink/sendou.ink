import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { seededRandom } from "~/utils/random";
import * as ArtRepository from "../ArtRepository.server";
import { artSearchParams } from "../art-search-params";

const RECENTLY_UPLOADED_ARTS_COUNT = 100;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const cachedArts = await cachified({
		key: "arts",
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const { seededShuffle } = seededRandom(dailySeed());

			return {
				showcaseArts: seededShuffle(await showcaseArts(null).execute()),
				recentlyUploadedArts: await ArtRepository.arts()
					.withAuthor()
					.limit(RECENTLY_UPLOADED_ARTS_COUNT)
					.execute(),
				allTags: await ArtRepository.tags().execute(),
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
		showcaseArts: await showcaseArts(filteredTag.id).execute(),
	};
};

function showcaseArts(tagId: number | null) {
	return ArtRepository.arts()
		.bestOfEachAuthor(tagId)
		.withAuthor()
		.showcaseFirst();
}

function dailySeed() {
	const today = new Date();
	return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}
