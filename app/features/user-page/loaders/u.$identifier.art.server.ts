import * as ArtRepository from "~/features/art/ArtRepository.server";
import * as ArtListing from "~/features/art/core/ArtListing";
import { getUser } from "~/features/auth/core/user.server";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";

export const loader = async () => {
	const loggedInUser = getUser();
	const userId = userPageUserId();

	const arts = await ArtRepository.findArtsByUserId(userId);

	return {
		arts,
		tagCounts: ArtListing.tagCounts(arts),
		unvalidatedArtCount:
			userId === loggedInUser?.id
				? await ImageRepository.countUnvalidatedArt(userId)
				: 0,
	};
};
