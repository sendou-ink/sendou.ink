import type { LoaderFunctionArgs } from "react-router";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { getUser } from "~/features/auth/core/user.server";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const loggedInUser = await getUser();

	const { identifier } = userParamsSchema.parse(params);
	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);

	const arts = await ArtRepository.findArtsByUserId(user.id);

	const tagCounts = arts.reduce(
		(acc, art) => {
			if (!art.tags) return acc;

			for (const tag of art.tags) {
				acc[tag.name] = (acc[tag.name] ?? 0) + 1;
			}
			return acc;
		},
		{} as Record<string, number>,
	);

	const tagCountsSortedArr = Object.entries(tagCounts).sort(
		(a, b) => b[1] - a[1],
	);

	return {
		arts,
		tagCounts: tagCountsSortedArr.length > 0 ? tagCountsSortedArr : null,
		unvalidatedArtCount:
			user.id === loggedInUser?.id
				? await ImageRepository.countUnvalidatedArt(user.id)
				: 0,
	};
};
