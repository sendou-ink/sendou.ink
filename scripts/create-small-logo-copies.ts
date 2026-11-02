// Uploads the downscaled `-small` copy (see `smallImageFileName`) of every team, tournament, tournament team,
// organization and stream logo that doesn't have one yet. Images uploaded since get theirs on upload.
// Resumable: logos whose small copy already exists are skipped, so rerun it to retry failures.
//
// Run it against a fresh production snapshot and the production bucket BEFORE deploying the code that
// shows the small copies, and once more after the deploy for the logos uploaded in between:
//
// usage: pnpm run download-prod-db && cross-env DB_PATH=db-sandbox.sqlite3 \
//   VITE_TOURNAMENT_DEFAULT_LOGO=... STORAGE_END_POINT=... STORAGE_ACCESS_KEY=... STORAGE_SECRET=... \
//   STORAGE_REGION=... STORAGE_BUCKET=... vite-node scripts/create-small-logo-copies.ts [concurrency=8]

import { Config } from "~/config";
import { db } from "~/db/sql";
import { smallImageCopy } from "~/features/img-upload/image-bytes.server";
import { imageExtensionFromMagicBytes } from "~/features/img-upload/image-signature";
import {
	downloadFromS3,
	existsInS3,
	uploadImmutableToS3,
} from "~/features/img-upload/s3.server";
import { logger } from "~/utils/logger";
import { smallImageFileName } from "~/utils/urls";

const PROGRESS_LOG_EVERY = 500;

const concurrency = Number(process.argv[2] ?? 8);

const fileNames = await logoFileNames();
logger.info(`Checking the small copies of ${fileNames.length} logos`);

const stats = {
	created: 0,
	alreadyExisted: 0,
	missingOriginal: 0,
	unsupportedFormat: 0,
	failed: 0,
};
const failedFileNames: string[] = [];

for (let i = 0; i < fileNames.length; i += concurrency) {
	await Promise.all(
		fileNames.slice(i, i + concurrency).map(async (fileName) => {
			try {
				stats[await createSmallCopy(fileName)]++;
			} catch (error) {
				logger.warn(`Failed to create the small copy of ${fileName}`, error);
				stats.failed++;
				failedFileNames.push(fileName);
			}
		}),
	);

	const processed = Math.min(i + concurrency, fileNames.length);
	if (
		Math.floor(processed / PROGRESS_LOG_EVERY) >
		Math.floor(i / PROGRESS_LOG_EVERY)
	) {
		logger.info(`${processed}/${fileNames.length}: ${JSON.stringify(stats)}`);
	}
}

logger.info(`Done: ${JSON.stringify(stats)}`);
if (failedFileNames.length > 0) {
	logger.warn(
		`Failed (rerun the script to retry): ${failedFileNames.join(",")}`,
	);
}

async function createSmallCopy(
	fileName: string,
): Promise<Exclude<keyof typeof stats, "failed">> {
	const smallFileName = smallImageFileName(fileName);
	if (smallFileName === fileName) return "unsupportedFormat";
	if (await existsInS3(smallFileName)) return "alreadyExisted";

	const image = await downloadFromS3(fileName);
	if (!image) return "missingOriginal";

	const extension = imageExtensionFromMagicBytes(image);
	if (!extension) return "unsupportedFormat";

	await uploadImmutableToS3({
		key: smallFileName,
		body: await smallImageCopy(image, extension),
		contentType: `image/${extension}`,
	});

	return "created";
}

async function logoFileNames() {
	const logoImgIds = db
		.selectFrom("Team")
		.select("avatarImgId as imgId")
		.union(db.selectFrom("CalendarEvent").select("avatarImgId as imgId"))
		.union(db.selectFrom("TournamentTeam").select("avatarImgId as imgId"))
		.union(
			db.selectFrom("TournamentOrganization").select("avatarImgId as imgId"),
		)
		.union(db.selectFrom("ExternalStream").select("avatarImgId as imgId"));

	const rows = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.select("url")
		.where("id", "in", logoImgIds)
		.orderBy("id", "desc")
		.execute();

	return [Config.tournamentDefaultLogo, ...rows.map((row) => row.url)];
}
