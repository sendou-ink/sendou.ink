import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { userPageUser } from "~/features/user-page/user-page-context.server";
import { userPage } from "~/utils/urls";

export const loader = async () => {
	const user = requireUser();
	const userToBeEdited = userPageUser();
	if (user.id !== userToBeEdited.id) {
		throw redirect(userPage(userToBeEdited));
	}

	const userProfile = (await editedProfile(user.id).executeTakeFirst())!;
	const friendCodeResult = await UserRepository.findCurrentFriendCodeByUserId(
		user.id,
	);
	const ownedTrophies = await TrophyRepository.findByOwnerUserIdIncludingHidden(
		user.id,
	);

	return {
		user: userProfile,
		favoriteTrophyIds: userProfile.favoriteTrophyIds,
		hiddenTrophyIds: userProfile.hiddenTrophyIds,
		ownedTrophies,
		friendCode: friendCodeResult?.friendCode ?? null,
	};
};

function editedProfile(userId: number) {
	return UserRepository.users()
		.where({ id: userId })
		.withCountry()
		.withColumns([
			"customName",
			"inGameName",
			"pronouns",
			"customAvatarImgId",
			"favoriteTrophyIds",
			"hiddenTrophyIds",
		]);
}
