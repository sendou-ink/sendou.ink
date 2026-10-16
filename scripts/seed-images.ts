import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "~/utils/logger";
import {
	getArtFilename,
	SEED_ART_URLS,
	SEED_AVATARS,
	SEED_DEFAULT_TOURNAMENT_LOGO,
	SEED_LOGO_FILENAMES,
	SEED_NUMBERED_LOGOS,
} from "./seed-art-urls";

function storageClient(): Bun.S3Client | null {
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
		return null;
	}

	return new Bun.S3Client({
		endpoint: STORAGE_END_POINT,
		accessKeyId: STORAGE_ACCESS_KEY,
		secretAccessKey: STORAGE_SECRET,
		region: STORAGE_REGION,
		bucket: STORAGE_BUCKET,
	});
}

async function isStorageReachable(client: Bun.S3Client): Promise<boolean> {
	try {
		await client.list({ maxKeys: 1 });
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

export async function seedImages(): Promise<void> {
	const client = storageClient();

	if (!client || !(await isStorageReachable(client))) {
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
			const regularExists = await client.exists(filename);
			const smallExists = await client.exists(smallFilename);

			if (regularExists && smallExists) continue;

			const imageBuffer = await loadImage();

			if (!regularExists) {
				logger.info(`  Uploading ${filename} to storage...`);
				await client.write(filename, imageBuffer, { acl: "public-read" });
			}

			if (!smallExists) {
				logger.info(`  Uploading ${smallFilename} to storage...`);
				await client.write(smallFilename, imageBuffer, {
					acl: "public-read",
				});
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
