import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ArtRepository from "../ArtRepository.server";
import { NEW_ART_EXISTING_SEARCH_PARAM_KEY } from "../art-constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();

	const artIdRaw = new URL(request.url).searchParams.get(
		NEW_ART_EXISTING_SEARCH_PARAM_KEY,
	);
	if (!artIdRaw) return { art: null, tags: await ArtRepository.findAllTags() };
	const artId = Number(artIdRaw);

	const userArts = await ArtRepository.findArtsByUserId(user.id, {
		includeTagged: false,
	});
	const art = userArts.find((a) => a.id === artId);
	if (!art) {
		return { art: null, tags: await ArtRepository.findAllTags() };
	}

	return { art, tags: await ArtRepository.findAllTags() };
};
