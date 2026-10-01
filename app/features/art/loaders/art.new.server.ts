import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ArtRepository from "../ArtRepository.server";
import { artNewSearchParams } from "../art-search-params";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { art: artId } = artNewSearchParams.parse(url);
	const art =
		artId === null
			? undefined
			: await ownArt(artId, user.id).executeTakeFirst();

	return { art: art ?? null, tags: await ArtRepository.tags().execute() };
};

function ownArt(artId: number, userId: number) {
	return ArtRepository.arts()
		.where({ id: artId, authorId: userId })
		.withTags()
		.withLinkedUsers();
}
