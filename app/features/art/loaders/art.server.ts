import type { LoaderFunctionArgs } from "react-router";
import { seededRandom } from "~/utils/random";
import * as ArtRepository from "../ArtRepository.server";
import { artSearchParams } from "../art-search-params";

const RECENTLY_UPLOADED_ARTS_COUNT = 100;

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const recentlyUploadedArts = await ArtRepository.arts()
		.withAuthor()
		.limit(RECENTLY_UPLOADED_ARTS_COUNT)
		.execute();
	const allTags = await ArtRepository.tags().execute();

	const { tag: filteredTagName } = artSearchParams.parse(url);

	const filteredTag = filteredTagName
		? allTags.find((t) => t.name === filteredTagName)
		: null;

	return {
		showcaseArts: await resolveShowcaseArts({ filteredTag, filteredTagName }),
		recentlyUploadedArts,
		allTags,
	};
};

async function resolveShowcaseArts({
	filteredTag,
	filteredTagName,
}: {
	filteredTag: { id: number } | null | undefined;
	filteredTagName: string | null;
}) {
	if (filteredTag) return showcaseArts(filteredTag.id).execute();
	if (filteredTagName) return [];

	const { seededShuffle } = seededRandom(dailySeed());
	return seededShuffle(await showcaseArts(null).execute());
}

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
