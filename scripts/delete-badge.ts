import "dotenv/config";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const rawId = process.argv[2]?.trim();

invariant(rawId, "id of badge is required (argument 1)");

const id = Number(rawId);

invariant(!Number.isNaN(id), "id must be a number");

async function main() {
	const owners = await db
		.selectFrom("BadgeOwner")
		.select(["badgeId"])
		.where("BadgeOwner.badgeId", "=", id)
		.execute();

	invariant(owners.length === 0, "Badge is still owned by someone");

	await db.deleteFrom("Badge").where("id", "=", id).execute();

	logger.info("done with deleting the badge");
}

void main();
