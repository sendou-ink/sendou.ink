import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { logger } from "~/utils/logger";
import {
	getArtFilename,
	SEED_ART_URLS,
	SEED_TEAM_IMAGES,
	SEED_TOURNAMENT_IMAGES,
} from "./seed-art-urls";

async function checkMinioConnection(): Promise<boolean> {
	try {
		const {
			STORAGE_END_POINT,
			STORAGE_ACCESS_KEY,
			STORAGE_SECRET,
			STORAGE_REGION,
			STORAGE_BUCKET,
		} = process.env;

		if (
			!(
				STORAGE_ACCESS_KEY &&
				STORAGE_END_POINT &&
				STORAGE_SECRET &&
				STORAGE_REGION &&
				STORAGE_BUCKET
			)
		) {
			logger.warn("Storage configuration not found in environment");
			return false;
		}

		const s3 = new S3({
			endpoint: STORAGE_END_POINT,
			forcePathStyle: false,
			credentials: {
				accessKeyId: STORAGE_ACCESS_KEY,
				secretAccessKey: STORAGE_SECRET,
			},
			region: STORAGE_REGION,
		});

		await s3.headBucket({ Bucket: STORAGE_BUCKET });
		return true;
	} catch {
		return false;
	}
}

async function downloadImage(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

async function readLocalImage(filename: string): Promise<Buffer> {
	const imagePath = join(process.cwd(), "app", "db", "seed", "img", filename);
	return await readFile(imagePath);
}

async function uploadToMinio(
	imageBuffer: Buffer,
	filename: string,
): Promise<string> {
	const {
		STORAGE_END_POINT,
		STORAGE_ACCESS_KEY,
		STORAGE_SECRET,
		STORAGE_REGION,
		STORAGE_BUCKET,
	} = process.env;

	const s3 = new S3({
		endpoint: STORAGE_END_POINT,
		forcePathStyle: false,
		credentials: {
			accessKeyId: STORAGE_ACCESS_KEY!,
			secretAccessKey: STORAGE_SECRET!,
		},
		region: STORAGE_REGION,
	});

	const stream = Readable.from(imageBuffer);

	const upload = new Upload({
		client: s3,
		params: {
			Bucket: STORAGE_BUCKET!,
			Key: filename,
			Body: stream,
			ACL: "public-read",
		},
	});

	await upload.done();

	return filename;
}

async function fileExistsInMinio(filename: string): Promise<boolean> {
	try {
		const {
			STORAGE_END_POINT,
			STORAGE_ACCESS_KEY,
			STORAGE_SECRET,
			STORAGE_REGION,
			STORAGE_BUCKET,
		} = process.env;

		const s3 = new S3({
			endpoint: STORAGE_END_POINT,
			forcePathStyle: false,
			credentials: {
				accessKeyId: STORAGE_ACCESS_KEY!,
				secretAccessKey: STORAGE_SECRET!,
			},
			region: STORAGE_REGION,
		});

		await s3.headObject({
			Bucket: STORAGE_BUCKET!,
			Key: filename,
		});

		return true;
	} catch {
		return false;
	}
}

export async function seedImages(): Promise<void> {
	const minioAvailable = await checkMinioConnection();

	if (!minioAvailable) {
		logger.warn(
			"⚠️  Minio is not available. Skipping image seeding. Make sure Docker is running if you want to seed images.",
		);
		return;
	}

	logger.info(`📥 Processing ${SEED_ART_URLS.length} art images`);

	let successCount = 0;
	let failCount = 0;
	let skippedCount = 0;

	for (let i = 0; i < SEED_ART_URLS.length; i++) {
		const url = SEED_ART_URLS[i];
		const filename = getArtFilename(i);
		const smallFilename = filename.replace(/\.(\w+)$/, "-small.$1");

		try {
			const regularExists = await fileExistsInMinio(filename);
			const smallExists = await fileExistsInMinio(smallFilename);

			if (regularExists && smallExists) {
				skippedCount++;
				logger.info(
					`  ↷ Files ${filename} and ${smallFilename} already exist in Minio`,
				);
			} else {
				const imageBuffer = await downloadImage(url);

				if (!regularExists) {
					logger.info(`  Uploading ${filename} to Minio...`);
					await uploadToMinio(imageBuffer, filename);
				}

				if (!smallExists) {
					logger.info(`  Uploading ${smallFilename} to Minio...`);
					await uploadToMinio(imageBuffer, smallFilename);
				}

				successCount++;
			}
		} catch (err) {
			failCount++;
			logger.error(
				`  ✗ Failed to process ${filename}: ${(err as Error).message}`,
			);
		}
	}

	logger.info(
		`\n✅ Art image seeding complete: ${successCount} uploaded, ${skippedCount} already existed, ${failCount} failed`,
	);

	logger.info(
		`\n📥 Processing ${SEED_TEAM_IMAGES.length} team images and ${SEED_TOURNAMENT_IMAGES.length} tournament images`,
	);

	const localImages = [...SEED_TEAM_IMAGES, ...SEED_TOURNAMENT_IMAGES];

	let localSuccessCount = 0;
	let localFailCount = 0;
	let localSkippedCount = 0;

	for (const { filename } of localImages) {
		const smallFilename = filename.replace(/\.(\w+)$/, "-small.$1");

		try {
			const regularExists = await fileExistsInMinio(filename);
			const smallExists = await fileExistsInMinio(smallFilename);

			if (regularExists && smallExists) {
				localSkippedCount++;
				logger.info(
					`  ↷ Files ${filename} and ${smallFilename} already exist in Minio`,
				);
			} else {
				const imageBuffer = await readLocalImage(filename);

				if (!regularExists) {
					logger.info(`  Uploading ${filename} to Minio...`);
					await uploadToMinio(imageBuffer, filename);
				}

				if (!smallExists) {
					logger.info(`  Uploading ${smallFilename} to Minio...`);
					await uploadToMinio(imageBuffer, smallFilename);
				}

				localSuccessCount++;
			}
		} catch (err) {
			localFailCount++;
			logger.error(
				`  ✗ Failed to process ${filename}: ${(err as Error).message}`,
			);
		}
	}

	logger.info(
		`\n✅ Local image seeding complete: ${localSuccessCount} uploaded, ${localSkippedCount} already existed, ${localFailCount} failed`,
	);
}
