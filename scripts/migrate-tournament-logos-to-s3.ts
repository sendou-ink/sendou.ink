import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { db } from "~/db/sql";
import { uploadStreamToS3 } from "~/features/img-upload/s3.server";
import { databaseTimestampNow } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const TOURNAMENT_LOGO_PATH = "public/static-assets/img/tournament-logos";
const ADMIN_ID = 1;

const LOGO_IDENTIFIER_TO_PATTERN: Record<string, string[]> = {
	sf: ["sendouq"],
	pp: ["paddling pool"],
	itz: ["in the zone"],
	pn: ["picnic"],
	pg: ["proving grounds"],
	tc: ["triton"],
	sos: ["swim or sink"],
	ftiu: ["from the ink up"],
	cc: ["coral clash"],
	lu: ["level up"],
	a41: ["all 4 one"],
	fb: ["fry basket"],
	d: ["the depths"],
	e: ["eclipse"],
	hc: ["homecoming"],
	bio: ["bad ideas"],
	ai: ["tenoch"],
	mm: ["megalodon monday"],
	ho: ["heaven 2 ocean"],
	kr: ["kraken royale"],
	mr: ["menu royale"],
	bc: ["barracuda co"],
	ci: ["crimson ink"],
	me: ["mesozoic mayhem"],
	ros: ["rain or shine"],
	sj: ["squid junction"],
	ss: ["silly sausage"],
	ul: ["united-lan"],
	sc: ["soul cup"],
};

async function uploadLogoFile(
	filePath: string,
	identifier: string,
): Promise<string> {
	logger.info(`Uploading ${identifier}.png to S3...`);

	const fileBuffer = fs.readFileSync(filePath);
	const stream = Readable.from(fileBuffer);

	const fileName = `tournament-logo-${identifier}.png`;

	const s3Url = await uploadStreamToS3(stream, fileName);

	invariant(s3Url, `Failed to upload ${identifier}.png to S3`);

	logger.info(`Uploaded ${identifier}.png to ${s3Url}`);
	return fileName;
}

async function createImageRecord(url: string): Promise<number> {
	const result = await db
		.insertInto("UnvalidatedUserSubmittedImage")
		.values({
			url,
			validatedAt: databaseTimestampNow(),
			submitterUserId: ADMIN_ID,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
}

async function updateCalendarEvents(
	imageId: number,
	patterns: string[],
): Promise<number> {
	const events = await db
		.selectFrom("CalendarEvent")
		.select(["id", "name"])
		.where("avatarImgId", "is", null)
		.execute();

	let updateCount = 0;

	for (const event of events) {
		const normalizedEventName = event.name.toLowerCase();
		const matches = patterns.some((pattern) =>
			normalizedEventName.includes(pattern),
		);

		if (matches) {
			await db
				.updateTable("CalendarEvent")
				.set({ avatarImgId: imageId })
				.where("id", "=", event.id)
				.execute();

			logger.info(`Updated CalendarEvent ${event.id}: "${event.name}"`);
			updateCount++;
		}
	}

	return updateCount;
}

async function main() {
	logger.info("Starting tournament logo migration to S3...");

	const defaultLogoPath = path.join(TOURNAMENT_LOGO_PATH, "default.png");
	if (fs.existsSync(defaultLogoPath)) {
		logger.info("\n=== Uploading default tournament logo ===");
		const defaultS3Url = await uploadLogoFile(defaultLogoPath, "default");
		const defaultImageId = await createImageRecord(defaultS3Url);
		logger.info(
			`Created UnvalidatedUserSubmittedImage record for default logo with ID ${defaultImageId}\n`,
		);
	}

	const logoFiles = fs
		.readdirSync(TOURNAMENT_LOGO_PATH)
		.filter((file) => file.endsWith(".png") && file !== "default.png");

	logger.info(`Found ${logoFiles.length} logo files to migrate`);

	let totalUpdated = 0;

	for (const file of logoFiles) {
		const identifier = file.replace(".png", "");
		const patterns = LOGO_IDENTIFIER_TO_PATTERN[identifier];

		if (!patterns) {
			logger.warn(`No pattern mapping found for ${identifier}, skipping...`);
			continue;
		}

		const filePath = path.join(TOURNAMENT_LOGO_PATH, file);

		const s3Url = await uploadLogoFile(filePath, identifier);

		const imageId = await createImageRecord(s3Url);
		logger.info(
			`Created UnvalidatedUserSubmittedImage record with ID ${imageId}`,
		);

		const updatedCount = await updateCalendarEvents(imageId, patterns);
		totalUpdated += updatedCount;

		logger.info(
			`Updated ${updatedCount} CalendarEvent records for ${identifier}\n`,
		);
	}

	logger.info("\n=== Migration Complete ===");
	logger.info(`Total CalendarEvent records updated: ${totalUpdated}`);
}

main()
	.then(() => {
		logger.info("Script completed successfully");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("Script failed:", error);
		process.exit(1);
	});
