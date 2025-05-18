import "dotenv/config";
import { db } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

async function main() {
	const name = process.argv[2]?.trim();
	const orgIdRaw = process.argv[3]?.trim();
	const orgId = Number(orgIdRaw);

	invariant(name, "name of tournament is required (argument 1)");
	invariant(orgIdRaw, "org id is required (argument 2)");
	invariant(!Number.isNaN(orgId), "org id must be a number");

	await db
		.selectFrom("TournamentOrganization")
		.select(["TournamentOrganization.id"])
		.where("id", "=", orgId)
		.executeTakeFirstOrThrow();

	const allEvents = await db
		.selectFrom("CalendarEvent")
		.select(["CalendarEvent.name", "CalendarEvent.id"])
		.execute();

	const filtered = allEvents.filter((event) =>
		event.name.toLowerCase().includes(name.toLowerCase()),
	);

	await db
		.updateTable("CalendarEvent")
		.set({ organizationId: orgId })
		.where(
			"id",
			"in",
			filtered.map((event) => event.id),
		)
		.execute();

	logger.info(`Added ${filtered.length} tournaments to organization ${orgId}`);
}

main();
