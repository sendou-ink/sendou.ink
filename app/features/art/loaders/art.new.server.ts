import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ArtRepository from "../ArtRepository.server";
import { artNewSearchParams } from "../art-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { art: artId } = artNewSearchParams.parse(url);
	if (artId === null) {
		return { art: null, tags: await ArtRepository.findAllTags() };
	}

	const userArts = await ArtRepository.findArtsByUserId(user.id, {
		includeTagged: false,
	});
	const art = userArts.find((a) => a.id === artId);
	if (!art) {
		return { art: null, tags: await ArtRepository.findAllTags() };
	}

	return { art, tags: await ArtRepository.findAllTags() };
};
