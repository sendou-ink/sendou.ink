import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import invariant from "~/utils/invariant";
import type { SendouInkDiscordMetadata } from "../discord-types";
import * as DiscordAPI from "./DiscordAPI.server";

/**
 * Updates a user's Discord linked role metadata with their current sendou.ink data.
 * Pushes the user's Plus tier (if not banned) to Discord for linked role verification.
 * If user has not linked their Discord, no action is taken.
 *
 * @param userId - The sendou.ink user ID to update metadata for
 */
export async function updateUserDiscordMetadata(userId: number) {
	const user = await UserRepository.findLeanById(userId);
	invariant(user, "User not found");
	const isBanned = userIsBanned(userId);

	const metadata: SendouInkDiscordMetadata = {
		plustier: user.plusTier && !isBanned ? user.plusTier : undefined,
	};

	await DiscordAPI.pushMetadata(user, metadata);
}
