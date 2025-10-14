import type { LoaderFunctionArgs } from "@remix-run/node";
import * as ArtRepository from "../ArtRepository.server";
import { FILTERED_TAG_KEY_SEARCH_PARAM_KEY } from "../art-constants";
import { allArtTags } from "../queries/allArtTags.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const allTags = allArtTags();

	const filteredTagName = new URL(request.url).searchParams.get(
		FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
	);
	const filteredTag = allTags.find((t) => t.name === filteredTagName);

	return {
		showcaseArts: filteredTag
			? await ArtRepository.findShowcaseArtsByTag(filteredTag.id)
			: await ArtRepository.findShowcaseArts(),
		recentlyUploadedArts: await ArtRepository.findRecentlyUploadedArts(),
		allTags,
	};
};
