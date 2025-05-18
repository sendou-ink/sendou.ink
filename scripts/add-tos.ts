import "dotenv/config";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { logger } from "~/utils/logger";

async function main() {
	const input = process.argv[2]?.trim();

	const userIds = input.split(",").map((id) => Number(id));

	for (const userId of userIds) {
		await AdminRepository.makeTournamentOrganizerByUserId(userId);
	}
	logger.info(`Added TOs: ${userIds}`);
}

main();
