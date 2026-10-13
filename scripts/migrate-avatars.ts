// One-time migration to self-hosted avatars:
// 1. copies every user's Discord avatar to S3 as their synced avatar
// 2. creates the small copy of every custom avatar uploaded before small copies existed
// Resumable: users already migrated are skipped, so it can be rerun e.g. right after deploying.
//
// usage: vite-node scripts/migrate-avatars.ts [concurrency=4]

import { db } from "~/db/sql";
import * as DiscordAvatar from "~/features/auth/core/DiscordAvatar.server";
import {
	imageExtensionFromMagicBytes,
	smallImageCopy,
} from "~/features/img-upload/image-bytes.server";
import {
	existsInS3,
	uploadImmutableToS3,
} from "~/features/img-upload/s3.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { smallImageFileName, userSubmittedImageUrl } from "~/utils/urls";

const PAGE_SIZE = 500;
const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DELAY_BETWEEN_BATCHES_MS = 100;

const concurrency = Number(process.argv[2] ?? 4);

await migrateSyncedAvatars();
await createCustomAvatarSmallCopies();

async function migrateSyncedAvatars() {
	const stats = { stored: 0, notFound: 0, failed: 0 };
	const failedUserIds: number[] = [];

	let lastId = 0;
	while (true) {
		const users = await db
			.selectFrom("User")
			.select(["User.id", "User.discordId", "User.discordAvatar"])
			.where("User.discordAvatar", "is not", null)
			.where("User.syncedAvatarImgId", "is", null)
			.where("User.id", ">", lastId)
			.orderBy("User.id", "asc")
			.limit(PAGE_SIZE)
			.execute();

		if (users.length === 0) break;

		await inBatches(users, async (user) => {
			const hash = user.discordAvatar!;
			const fileName = await withRetries(() =>
				DiscordAvatar.store({
					userId: user.id,
					discordId: user.discordId,
					hash,
				}),
			);

			if (fileName === undefined) {
				stats.failed++;
				failedUserIds.push(user.id);
				return;
			}

			await UserRepository.replaceSyncedAvatar({
				userId: user.id,
				discordAvatar: fileName ? hash : null,
				fileName,
			});

			if (fileName) {
				stats.stored++;
			} else {
				stats.notFound++;
			}
		});

		lastId = users[users.length - 1].id;
		logger.info(
			`Synced avatars up to user id ${lastId}: ${JSON.stringify(stats)}`,
		);
	}

	logger.info(`Synced avatars done: ${JSON.stringify(stats)}`);
	if (failedUserIds.length > 0) {
		logger.warn(
			`Failed users (rerun the script to retry): ${failedUserIds.join(",")}`,
		);
	}
}

async function createCustomAvatarSmallCopies() {
	const images = await db
		.selectFrom("User")
		.innerJoin(
			"UnvalidatedUserSubmittedImage",
			"UnvalidatedUserSubmittedImage.id",
			"User.customAvatarImgId",
		)
		.select("UnvalidatedUserSubmittedImage.url")
		.execute();

	let created = 0;
	await inBatches(images, async ({ url }) => {
		const smallFileName = smallImageFileName(url);
		if (await existsInS3(smallFileName)) return;

		const response = await fetch(userSubmittedImageUrl(url));
		if (!response.ok) {
			logger.warn(`Custom avatar ${url} responded with ${response.status}`);
			return;
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		const extension = imageExtensionFromMagicBytes(buffer);
		invariant(extension, `Custom avatar ${url} is not a supported image`);

		await uploadImmutableToS3({
			key: smallFileName,
			body: await smallImageCopy(buffer, extension),
			contentType: `image/${extension}`,
		});
		created++;
	});

	logger.info(
		`Custom avatar small copies done: ${created} created of ${images.length}`,
	);
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
	for (let i = 0; i < items.length; i += concurrency) {
		await Promise.all(items.slice(i, i + concurrency).map(fn));
		await sleep(DELAY_BETWEEN_BATCHES_MS);
	}
}

/** `undefined` when every attempt failed. */
async function withRetries<T>(fn: () => Promise<T>): Promise<T | undefined> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return await fn();
		} catch (error) {
			const retryAfterMs =
				error instanceof DiscordAvatar.DiscordCdnError &&
				error.retryAfterSeconds
					? error.retryAfterSeconds * 1000
					: DEFAULT_RETRY_DELAY_MS * attempt;

			logger.warn(
				`Attempt ${attempt} failed, retrying in ${retryAfterMs}ms`,
				error,
			);
			await sleep(retryAfterMs);
		}
	}

	return undefined;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
