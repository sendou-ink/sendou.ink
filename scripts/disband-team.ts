import "dotenv/config";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const id = Number(process.argv[2]?.trim());

invariant(id, "team id is required (argument 1)");
invariant(Number.isInteger(id), "team id must be an integer");

async function main() {
	await db
		.updateTable("AllTeam")
		.set({
			deletedAt: dateToDatabaseTimestamp(new Date()),
		})
		.where("id", "=", id)
		.execute();

	logger.info(`Disbanded team with id: ${id}`);
}

void main();
