import "dotenv/config";

import { db } from "~/db/sql";
import homemadeBadges from "~/features/badges/homemade.json";
import { logger } from "~/utils/logger";

async function main() {
	let deleted = 0;
	let updated = 0;

	// update existing
	for (const existingBadge of await homemadeBadgesInDb()) {
		const badge =
			homemadeBadges[existingBadge.code as keyof typeof homemadeBadges];

		if (!badge) {
			await deleteBadge(existingBadge.id);
			deleted++;
			continue;
		}

		const author = await findUserByDiscordId(badge.authorDiscordId);

		if (!author) {
			logger.warn(
				`Author not found for badge with id: ${existingBadge.id}, skipping`,
			);
			continue;
		}

		if (
			badge.displayName !== existingBadge.displayName ||
			badge.authorDiscordId !== existingBadge.discordId
		) {
			await updateBadge(existingBadge.id, {
				displayName: badge.displayName,
				authorId: author.id,
			});
			updated++;
		}
	}

	const homemadeAfterUpdates = await homemadeBadgesInDb();

	let added = 0;

	// add new
	for (const [fileName, badge] of Object.entries(homemadeBadges)) {
		const existing = homemadeAfterUpdates.find(
			(existingBadge) => fileName === existingBadge.code,
		);

		if (existing) {
			continue;
		}

		const author = await findUserByDiscordId(badge.authorDiscordId);
		if (!author) {
			logger.warn(
				`Author not found for badge with fileName: ${fileName}, skipping`,
			);
			continue;
		}

		await addBadge({
			code: fileName,
			displayName: badge.displayName,
			authorId: author.id,
		});

		added++;
	}

	logger.info(
		`Deleted ${deleted}, updated ${updated}, added ${added} homemade badges`,
	);
}

async function homemadeBadgesInDb() {
	return db
		.selectFrom("Badge")
		.innerJoin("User", "Badge.authorId", "User.id")
		.select(["Badge.id", "Badge.code", "User.discordId", "Badge.displayName"])
		.execute();
}

async function findUserByDiscordId(discordId: string) {
	return db
		.selectFrom("User")
		.select("id")
		.where("discordId", "=", discordId)
		.executeTakeFirst();
}

async function deleteBadge(badgeId: number) {
	const owners = await db
		.selectFrom("BadgeOwner")
		.where("badgeId", "=", badgeId)
		.execute();

	if (owners.length > 0) {
		logger.warn(`Refusing to delete badge ${badgeId} because it has owners`);
		return;
	}

	await db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("BadgeManager")
			.where("badgeId", "=", badgeId)
			.execute();
		await trx.deleteFrom("Badge").where("id", "=", badgeId).execute();
	});
}

async function updateBadge(
	badgeId: number,
	badge: { displayName: string; authorId: number },
) {
	return db
		.updateTable("Badge")
		.set({
			displayName: badge.displayName,
			authorId: badge.authorId,
		})
		.where("id", "=", badgeId)
		.execute();
}

async function addBadge(badge: {
	code: string;
	displayName: string;
	authorId: number;
}) {
	return db
		.insertInto("Badge")
		.values({
			code: badge.code,
			displayName: badge.displayName,
			authorId: badge.authorId,
		})
		.execute();
}

main();
