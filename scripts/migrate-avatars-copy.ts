// Avatar migration part 1/2, run locally against a fresh production snapshot so the Discord CDN
// rate limits hit your machine instead of Render: copies the Discord avatars of users active in the
// last year to S3 and uploads a manifest of them, which `migrate-avatars-apply.ts` (part 2/2) then
// writes to the production database. Inactive users get theirs copied when they next log in.
// Resumable: avatars already in S3 are not downloaded again.
//
// usage: pnpm run download-prod-db && cross-env DB_PATH=db-sandbox.sqlite3 \
//   STORAGE_END_POINT=... STORAGE_ACCESS_KEY=... STORAGE_SECRET=... STORAGE_REGION=... STORAGE_BUCKET=... \
//   vite-node scripts/migrate-avatars-copy.ts [concurrency=4]

import { subYears } from "date-fns";
import type { NotNull } from "kysely";
import { db } from "~/db/sql";
import * as DiscordAvatar from "~/features/auth/core/DiscordAvatar.server";
import {
	existsInS3,
	uploadImmutableToS3,
} from "~/features/img-upload/s3.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { smallImageFileName } from "~/utils/urls";

const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DELAY_BETWEEN_BATCHES_MS = 100;
const PROGRESS_LOG_EVERY = 500;

const concurrency = Number(process.argv[2] ?? 4);

const users = await activeUsersWithDiscordAvatar(subYears(new Date(), 1));
logger.info(
	`Copying the avatars of ${users.length} users active in the last year`,
);

const manifest: Array<{
	userId: number;
	discordAvatar: string;
	fileName: string;
}> = [];
const stats = { copied: 0, alreadyCopied: 0, notFound: 0, failed: 0 };
const failedUserIds: number[] = [];

for (let i = 0; i < users.length; i += concurrency) {
	await Promise.all(
		users.slice(i, i + concurrency).map(async (user) => {
			const hash = user.discordAvatar!;
			const fileName = DiscordAvatar.fileNameOf({ userId: user.id, hash });

			// the small copy is uploaded last so it existing means both do
			if (await existsInS3(smallImageFileName(fileName))) {
				manifest.push({ userId: user.id, discordAvatar: hash, fileName });
				stats.alreadyCopied++;
				return;
			}

			const result = await withRetries(() =>
				DiscordAvatar.store({
					userId: user.id,
					discordId: user.discordId,
					hash,
				}),
			);

			if (result === undefined) {
				stats.failed++;
				failedUserIds.push(user.id);
			} else if (result === null) {
				stats.notFound++;
			} else {
				manifest.push({ userId: user.id, discordAvatar: hash, fileName });
				stats.copied++;
			}
		}),
	);
	await sleep(DELAY_BETWEEN_BATCHES_MS);

	const processed = Math.min(i + concurrency, users.length);
	if (
		Math.floor(processed / PROGRESS_LOG_EVERY) >
		Math.floor(i / PROGRESS_LOG_EVERY)
	) {
		logger.info(`${processed}/${users.length}: ${JSON.stringify(stats)}`);
	}
}

logger.info(`Copying done: ${JSON.stringify(stats)}`);
if (failedUserIds.length > 0) {
	logger.warn(
		`Failed users (rerun the script to retry): ${failedUserIds.join(",")}`,
	);
}

const manifestFileName = `avatar-manifest-${Date.now()}.json`;
await uploadImmutableToS3({
	key: manifestFileName,
	body: new TextEncoder().encode(JSON.stringify(manifest)),
	contentType: "application/json",
});

logger.info(
	`Uploaded the manifest of ${manifest.length} avatars, after deploying run on Render: pnpm exec vite-node scripts/migrate-avatars-apply.ts ${manifestFileName}`,
);

function activeUsersWithDiscordAvatar(since: Date) {
	const cutoff = dateToDatabaseTimestamp(since);

	const activeUserIds = db
		.selectFrom("User")
		.select("id as userId")
		.where("createdAt", ">", cutoff)
		.union(
			db
				.selectFrom("TournamentTeamMember")
				.select("userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("GroupMember")
				.select("userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("Build")
				.select("ownerId as userId")
				.where("updatedAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("ChatMessage")
				.select("authorUserId as userId")
				.where("authorUserId", "is not", null)
				.where("createdAt", ">", cutoff)
				.$narrowType<{ userId: NotNull }>(),
		)
		.union(
			db
				.selectFrom("LFGPost")
				.select("authorId as userId")
				.where("updatedAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("Art")
				.select("authorId as userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("TeamMember")
				.select("userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("FriendRequest")
				.select("senderId as userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("UserFriendCode")
				.select("userId")
				.where("createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("ScrimPostUser")
				.innerJoin("ScrimPost", "ScrimPost.id", "ScrimPostUser.scrimPostId")
				.select("ScrimPostUser.userId")
				.where("ScrimPost.createdAt", ">", cutoff),
		)
		.union(
			db
				.selectFrom("VoiceSession")
				.select("userId")
				.where("createdAt", ">", cutoff),
		);

	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.discordAvatar"])
		.where("User.discordAvatar", "is not", null)
		.where("User.syncedAvatarImgId", "is", null)
		.where("User.id", "in", activeUserIds)
		.orderBy("User.id", "asc")
		.execute();
}

/** `undefined` when every attempt failed. Only Discord CDN and network failures are retried. */
async function withRetries<T>(fn: () => Promise<T>): Promise<T | undefined> {
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return await fn();
		} catch (error) {
			const isRetryable =
				error instanceof DiscordAvatar.DiscordCdnError ||
				error instanceof TypeError;
			if (!isRetryable) throw error;

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
