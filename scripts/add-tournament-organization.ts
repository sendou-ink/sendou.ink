import "dotenv/config";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import * as TournamentOrganizationRepository from "../app/features/tournament-organization/TournamentOrganizationRepository.server";

async function main() {
	const name = process.argv[2]?.trim();
	const ownerIdRaw = process.argv[3]?.trim();
	const ownerId = Number(ownerIdRaw);

	invariant(name, "name of org is required (argument 1)");
	invariant(ownerIdRaw, "owner id is required (argument 2)");
	invariant(!Number.isNaN(ownerId), "owner id must be a number");

	await TournamentOrganizationRepository.create({
		name,
		ownerId,
	});
	logger.info(`Added new organization: ${name}`);
}

main();
