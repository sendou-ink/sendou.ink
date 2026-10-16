// Avatar migration part 2/2, run on Render right after deploying: points users at the avatars
// `migrate-avatars-copy.ts` (part 1/2) copied to S3, then creates the small copy of every custom
// avatar uploaded before small copies existed. Users whose avatar changed since the copy are skipped,
// they get the new one copied when they next log in. Safe to rerun.
//
// usage: pnpm exec vite-node scripts/migrate-avatars-apply.ts <manifest file name>

import * as v from "valibot";
import { db } from "~/db/sql";
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

const CUSTOM_AVATAR_CONCURRENCY = 4;

const manifestSchema = v.array(
	v.object({
		userId: v.number(),
		discordAvatar: v.string(),
		fileName: v.string(),
	}),
);

const manifestFileName = process.argv[2];
invariant(manifestFileName, "manifest file name is required (argument 1)");

await applySyncedAvatars(manifestFileName);
await createCustomAvatarSmallCopies();

async function applySyncedAvatars(fileName: string) {
	const response = await fetch(userSubmittedImageUrl(fileName));
	invariant(response.ok, `Manifest responded with ${response.status}`);
	const manifest = v.parse(manifestSchema, await response.json());

	const stats = { applied: 0, alreadyApplied: 0, avatarChanged: 0 };
	for (const entry of manifest) {
		const user = await db
			.selectFrom("User")
			.select(["User.discordAvatar", "User.syncedAvatarImgId"])
			.where("User.id", "=", entry.userId)
			.executeTakeFirst();

		if (user?.syncedAvatarImgId) {
			stats.alreadyApplied++;
			continue;
		}
		if (user?.discordAvatar !== entry.discordAvatar) {
			stats.avatarChanged++;
			continue;
		}

		await UserRepository.replaceSyncedAvatar({
			userId: entry.userId,
			discordAvatar: entry.discordAvatar,
			fileName: entry.fileName,
		});
		stats.applied++;
	}

	logger.info(`Synced avatars done: ${JSON.stringify(stats)}`);
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
	for (let i = 0; i < images.length; i += CUSTOM_AVATAR_CONCURRENCY) {
		await Promise.all(
			images.slice(i, i + CUSTOM_AVATAR_CONCURRENCY).map(async ({ url }) => {
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
			}),
		);
	}

	logger.info(
		`Custom avatar small copies done: ${created} created of ${images.length}`,
	);
}
