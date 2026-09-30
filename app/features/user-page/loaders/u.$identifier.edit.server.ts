import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { canAccessTrophies } from "~/features/trophies/trophies-utils";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUser } from "~/features/user-page/user-page-context.server";
import { userPage } from "~/utils/urls";

export const loader = async () => {
	const user = requireUser();
	const userToBeEdited = userPageUser();
	if (user.id !== userToBeEdited.id) {
		throw redirect(userPage(userToBeEdited));
	}

	const userProfile = (await UserRepository.findProfileByUserId(user.id))!;
	const friendCodeResult = await UserRepository.findCurrentFriendCodeByUserId(
		user.id,
	);
	const ownedTrophies = canAccessTrophies(user)
		? await TrophyRepository.findByOwnerUserIdIncludingHidden(user.id)
		: [];

	return {
		user: userProfile,
		favoriteTrophyIds: userProfile.favoriteTrophyIds,
		hiddenTrophyIds: userProfile.hiddenTrophyIds,
		ownedTrophies,
		friendCode: friendCodeResult?.friendCode ?? null,
	};
};
