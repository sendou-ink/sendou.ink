import {
	deleteFromS3,
	uploadImmutableToS3,
} from "~/features/img-upload/s3.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import { smallImageFileName } from "~/utils/urls";

const DISCORD_CDN_SIZE_PX = 240;
const DISCORD_CDN_SMALL_SIZE_PX = 80;

/**
 * Brings the user's synced avatar up to date with their Discord avatar `newHash`: copies the new
 * avatar to S3 as an image and deletes the previous one. Also copies an unchanged avatar that was
 * never stored (users skipped by the avatar migration). Never throws, a failed copy keeps the
 * previous avatar.
 */
export async function syncForUser({
	user,
	discordId,
	newHash,
}: {
	user: {
		id: number;
		discordAvatar: string | null;
		syncedAvatarImgId: number | null;
	};
	discordId: string;
	newHash: string | null;
}) {
	const isStored = !newHash || user.syncedAvatarImgId !== null;
	if (user.discordAvatar === newHash && isStored) return;

	try {
		const fileName = newHash
			? await store({ userId: user.id, discordId, hash: newHash })
			: null;

		const previousFileName = await UserRepository.replaceSyncedAvatar({
			userId: user.id,
			discordAvatar: fileName ? newHash : null,
			fileName,
		});

		// an overlapping sync of the same hash already stored the same keys
		if (previousFileName && previousFileName !== fileName) {
			await deleteFromS3([
				previousFileName,
				smallImageFileName(previousFileName),
			]);
		}
	} catch (error) {
		logger.error(`Failed to sync Discord avatar of user ${user.id}`, error);
	}
}

/**
 * Copies a Discord avatar and its small copy to S3, animated avatars as their still frame. Returns
 * the file name, or `null` when Discord doesn't have the avatar (anymore). Throws on other failures.
 */
async function store({
	userId,
	discordId,
	hash,
}: {
	userId: number;
	discordId: string;
	hash: string;
}): Promise<string | null> {
	const fileName = fileNameOf({ userId, hash });

	const files: Array<{ key: string; body: Uint8Array }> = [];
	for (const [key, sizePx] of [
		[fileName, DISCORD_CDN_SIZE_PX],
		[smallImageFileName(fileName), DISCORD_CDN_SMALL_SIZE_PX],
	] as const) {
		const response = await fetch(
			`https://cdn.discordapp.com/avatars/${discordId}/${hash}.webp?size=${sizePx}`,
		);

		if (response.status === 404) return null;
		if (!response.ok) {
			throw new Error(
				`Discord CDN responded with status code ${response.status}`,
			);
		}

		files.push({ key, body: new Uint8Array(await response.arrayBuffer()) });
	}

	for (const { key, body } of files) {
		await uploadImmutableToS3({ key, body, contentType: "image/webp" });
	}

	return fileName;
}

/** File name a Discord avatar is stored under, its small copy is next to it. */
export function fileNameOf({ userId, hash }: { userId: number; hash: string }) {
	return `avatar-${userId}-${hash}.webp`;
}
