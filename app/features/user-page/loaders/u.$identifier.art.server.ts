import * as ArtRepository from "~/features/art/ArtRepository.server";
import { getUser } from "~/features/auth/core/user.server";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import { userPageUserId } from "~/features/user-page/user-page-context.server";

export const loader = async () => {
	const loggedInUser = getUser();
	const userId = userPageUserId();

	const arts = await ArtRepository.findArtsByUserId(userId);

	const tagCounts = arts.reduce<Record<string, number>>((acc, art) => {
		if (!art.tags) return acc;

		for (const tag of art.tags) {
			acc[tag.name] = (acc[tag.name] ?? 0) + 1;
		}
		return acc;
	}, {});

	const tagCountsSortedArr = Object.entries(tagCounts).sort(
		(a, b) => b[1] - a[1],
	);

	return {
		arts,
		tagCounts: tagCountsSortedArr.length > 0 ? tagCountsSortedArr : null,
		unvalidatedArtCount:
			userId === loggedInUser?.id
				? await ImageRepository.countUnvalidatedArt(userId)
				: 0,
	};
};
