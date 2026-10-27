import { getUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";

export const loader = async () => {
	const user = getUser();

	const lobbies = await LobbyRepository.findAllForIndex();
	const friendCode = user
		? await UserRepository.findCurrentFriendCodeByUserId(user.id)
		: null;

	return { ...lobbies, hasFriendCode: Boolean(friendCode) };
};
