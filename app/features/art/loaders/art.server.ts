import type { LoaderFunctionArgs } from "@remix-run/node";
import { FILTERED_TAG_KEY_SEARCH_PARAM_KEY } from "../art-constants";
import { allArtTags } from "../queries/allArtTags.server";
import {
	showcaseArts,
	showcaseArtsByTag,
} from "../queries/showcaseArts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const allTags = allArtTags();

	const filteredTagName = new URL(request.url).searchParams.get(
		FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
	);
	const filteredTag = allTags.find((t) => t.name === filteredTagName);

	return {
		arts: filteredTag ? showcaseArtsByTag(filteredTag.id) : showcaseArts(),
		allTags,
	};
};
