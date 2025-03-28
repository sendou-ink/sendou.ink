import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { unauthorizedIfFalsy } from "~/utils/remix.server";
import { NEW_ART_EXISTING_SEARCH_PARAM_KEY } from "../art-constants";
import { allArtTags } from "../queries/allArtTags.server";
import { findArtById } from "../queries/findArtById.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	unauthorizedIfFalsy(user.isArtist);

	const artIdRaw = new URL(request.url).searchParams.get(
		NEW_ART_EXISTING_SEARCH_PARAM_KEY,
	);
	if (!artIdRaw) return { art: null, tags: allArtTags() };
	const artId = Number(artIdRaw);

	const art = findArtById(artId);
	if (!art || art.authorId !== user.id) {
		return { art: null, tags: allArtTags() };
	}

	return { art, tags: allArtTags() };
};
