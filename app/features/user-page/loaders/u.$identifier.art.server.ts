import type { LoaderFunctionArgs } from "@remix-run/node";
import { artsByUserId } from "~/features/art/queries/artsByUserId.server";
import { getUserId } from "~/features/auth/core/user.server";
import { countUnvalidatedArt } from "~/features/img-upload";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);

	const { identifier } = userParamsSchema.parse(params);
	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);

	const arts = artsByUserId(user.id);

	const tagCounts = arts.reduce(
		(acc, art) => {
			if (!art.tags) return acc;

			for (const tag of art.tags) {
				acc[tag] = (acc[tag] ?? 0) + 1;
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
			user.id === loggedInUser?.id ? countUnvalidatedArt(user.id) : 0,
	};
};
