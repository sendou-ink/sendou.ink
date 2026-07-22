import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { userParamsSchema } from "../user-page-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
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
	const preferences = await UserRepository.preferencesByUserId(user.id);
	const friendCodeResult = await UserRepository.currentFriendCodeByUserId(
		user.id,
	);
	const ownedTrophies = await TrophyRepository.findByOwnerUserIdIncludingHidden(
		user.id,
	);

	return {
		user: userProfile,
		favoriteBadgeIds: userProfile.favoriteBadgeIds,
		favoriteTrophyIds: userProfile.favoriteTrophyIds,
		hiddenTrophyIds: userProfile.hiddenTrophyIds,
		ownedTrophies,
		discordUniqueName: userProfile.discordUniqueName,
		newProfileEnabled: preferences?.newProfileEnabled ?? false,
		friendCode: friendCodeResult?.friendCode ?? null,
	};
};
