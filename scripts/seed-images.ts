import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { logger } from "~/utils/logger";
import {
	getArtFilename,
	SEED_ART_URLS,
	SEED_AVATARS,
	SEED_DEFAULT_TOURNAMENT_LOGO,
	SEED_LOGO_FILENAMES,
	SEED_NUMBERED_LOGOS,
} from "./seed-art-urls";

async function checkStorageConnection(): Promise<boolean> {
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

async function uploadToStorage(
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

async function fileExistsInStorage(filename: string): Promise<boolean> {
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
	const storageAvailable = await checkStorageConnection();

	if (!storageAvailable) {
		logger.warn(
			"⚠️  SeaweedFS is not available. Skipping image seeding. Make sure Docker is running if you want to seed images.",
		);
		return;
	}

	const artImages = SEED_ART_URLS.map((url, i) => ({
		filename: getArtFilename(i),
		loadImage: () => downloadImage(url),
	}));

	const localImages = [
		...SEED_LOGO_FILENAMES.map((filename) => ({
			filename,
			sourceFilename: filename,
		})),
		SEED_DEFAULT_TOURNAMENT_LOGO,
		...SEED_NUMBERED_LOGOS,
		...SEED_AVATARS,
	].map(({ filename, sourceFilename }) => ({
		filename,
		loadImage: () => readLocalImage(sourceFilename),
	}));

	const images = [...artImages, ...localImages];

	let uploadedCount = 0;
	let failCount = 0;

	for (const { filename, loadImage } of images) {
		const smallFilename = filename.replace(/\.(\w+)$/, "-small.$1");

		try {
			const regularExists = await fileExistsInStorage(filename);
			const smallExists = await fileExistsInStorage(smallFilename);

			if (regularExists && smallExists) continue;

			const imageBuffer = await loadImage();

			if (!regularExists) {
				logger.info(`  Uploading ${filename} to storage...`);
				await uploadToStorage(imageBuffer, filename);
			}

			if (!smallExists) {
				logger.info(`  Uploading ${smallFilename} to storage...`);
				await uploadToStorage(imageBuffer, smallFilename);
			}

			uploadedCount++;
		} catch (err) {
			failCount++;
			logger.error(
				`  ✗ Failed to process ${filename}: ${(err as Error).message}`,
			);
		}
	}

	if (uploadedCount === 0 && failCount === 0) return;

	logger.info(
		`🖼️  Image seeding complete: ${uploadedCount} uploaded, ${images.length - uploadedCount - failCount} already existed, ${failCount} failed`,
	);
}
