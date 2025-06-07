import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { userParamsSchema } from "../user-page-schemas.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);
	const { identifier } = userParamsSchema.parse(params);
	const userToBeEdited = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier),
	);
	if (user.id !== userToBeEdited.id) {
		throw redirect(userPage(userToBeEdited));
	}

	const userProfile = (await UserRepository.findProfileByIdentifier(
		identifier,
		true,
	))!;

	return {
		user: userProfile,
		favoriteBadgeIds: userProfile.favoriteBadgeIds,
		discordUniqueName: userProfile.discordUniqueName,
	};
};
