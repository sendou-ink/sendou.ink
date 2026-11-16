import { add } from "date-fns";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { logger } from "~/utils/logger";
import * as DiscordTokenRepository from "../DiscordTokenRepository.server";
import type { SendouInkDiscordMetadata } from "../discord-types";
import * as DiscordAPI from "./DiscordAPI.server";

const REFRESH_MARGIN = { minutes: 5 };

/** Stores the user's tokens from a finished linked role OAuth flow. */
export function saveTokens(userId: number, tokens: DiscordAPI.DiscordTokens) {
	return DiscordTokenRepository.upsert({
		userId,
		accessToken: tokens.accessToken(),
		refreshToken: tokens.refreshToken(),
		expiresAt: dateToDatabaseTimestamp(tokens.accessTokenExpiresAt()),
	});
}

/**
 * Pushes the user's current sendou.ink data (Plus tier unless banned) to Discord as their linked
 * role metadata. Does nothing for a user who has not linked. Tokens Discord no longer accepts are
 * deleted. Throws on other failures.
 */
export async function syncUser(userId: number) {
	const accessToken = await validAccessToken(userId);
	if (!accessToken) return;

	const user = await UserRepository.findLeanById(userId);
	if (!user) return;

	const result = await DiscordAPI.putRoleConnection({
		accessToken,
		platformUsername: user.username,
		metadata: metadataOf({
			plusTier: user.plusTier,
			isBanned: userIsBanned(userId),
		}),
	});

	if (result === "UNAUTHORIZED") {
		logger.info(`Discord linked role token of user ${userId} revoked`);
		await DiscordTokenRepository.deleteIfUnchanged({ userId, accessToken });
	}
}

/** {@link syncUser} for each user one after another. Never throws: failures are logged and the rest carry on. */
export async function syncUsers(userIds: number[]) {
	let failedCount = 0;

	for (const userId of userIds) {
		try {
			await syncUser(userId);
		} catch (error) {
			failedCount++;
			logger.error(`Syncing Discord linked role of user ${userId}:`, error);
		}
	}

	if (failedCount > 0) {
		logger.warn(
			`Syncing Discord linked roles failed for ${failedCount}/${userIds.length} users`,
		);
	}
}

function metadataOf({
	plusTier,
	isBanned,
}: {
	plusTier: number | null;
	isBanned: boolean;
}): SendouInkDiscordMetadata {
	return {
		plustier: plusTier && !isBanned ? plusTier : undefined,
	};
}

async function validAccessToken(userId: number) {
	const tokens = await DiscordTokenRepository.findByUserId(userId);
	if (!tokens) return null;

	const expiresAt = databaseTimestampToDate(tokens.expiresAt);
	if (expiresAt > add(new Date(), REFRESH_MARGIN)) return tokens.accessToken;

	const refreshed = await DiscordAPI.refreshTokens(tokens.refreshToken);
	if (!refreshed) {
		logger.info(`Discord linked role refresh token of user ${userId} revoked`);
		await DiscordTokenRepository.deleteIfUnchanged({
			userId,
			accessToken: tokens.accessToken,
		});
		return null;
	}

	await saveTokens(userId, refreshed);

	return refreshed.accessToken();
}
