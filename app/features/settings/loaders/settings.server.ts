import { getUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";

export const loader = async () => {
	const user = getUser();

	return {
		noScreen: user
			? await UserRepository.anyUserPrefersNoScreen([user.id])
			: null,
	};
};
