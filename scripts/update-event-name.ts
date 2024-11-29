import "dotenv/config";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const rawEventId = process.argv[2]?.trim();
invariant(rawEventId, "eventId is required (argument 1)");

const eventId = Number(rawEventId);
invariant(!Number.isNaN(eventId), "eventId must be a number");

const newName = process.argv[3]?.trim();
invariant(newName, "newName is required (argument 2)");

async function main() {
	const oldName = (
		await db
			.selectFrom("CalendarEvent")
			.select(["CalendarEvent.name"])
			.where("id", "=", eventId)
			.executeTakeFirstOrThrow()
	).name;

	await db
		.updateTable("CalendarEvent")
		.set({ name: newName })
		.where("CalendarEvent.id", "=", eventId)
		.execute();

	logger.info(
		`Event name updated from "${oldName}" to "${newName}" for event ID: ${eventId}`,
	);
}

main();
