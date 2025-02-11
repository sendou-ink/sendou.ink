import * as UserRepository from "~/features/user-page/UserRepository.server";
import { validate } from "~/utils/remix.server";
import type { Tournament } from "../tournament-bracket/core/Tournament";

export const inGameNameIfNeeded = async ({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) => {
	if (!tournament.ctx.settings.requireInGameNames) return null;

	const inGameName = await UserRepository.inGameNameByUserId(userId);

	validate(inGameName, "No in-game name");

	return inGameName;
};
