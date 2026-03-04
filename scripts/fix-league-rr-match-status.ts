// Usage: npx tsx ./scripts/fix-league-rr-match-status.ts <parentTournamentId>
// Example: npx tsx ./scripts/fix-league-rr-match-status.ts 3192

import "dotenv/config";
import { db } from "~/db/sql";
import { TournamentMatchStatus } from "~/db/tables";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const parentTournamentId = Number(process.argv[2]?.trim());

invariant(
	parentTournamentId && !Number.isNaN(parentTournamentId),
	"parent tournament id is required (argument 1)",
);

async function main() {
	const divisions = await db
		.selectFrom("Tournament")
		.select(["id"])
		.where("parentTournamentId", "=", parentTournamentId)
		.execute();

	logger.info(
		`Found ${divisions.length} divisions for tournament ${parentTournamentId}`,
	);

	let totalUpdated = 0;

	for (const division of divisions) {
		const stages = await db
			.selectFrom("TournamentStage")
			.select(["id"])
			.where("tournamentId", "=", division.id)
			.where("type", "=", "round_robin")
			.execute();

		for (const stage of stages) {
			const result = await db
				.updateTable("TournamentMatch")
				.set({ status: TournamentMatchStatus.Ready })
				.where("stageId", "=", stage.id)
				.where("status", "=", TournamentMatchStatus.Locked)
				.execute();

			const updatedCount = Number(result[0].numUpdatedRows);
			totalUpdated += updatedCount;

			logger.info(
				`Division ${division.id}, stage ${stage.id}: updated ${updatedCount} matches from Locked to Ready`,
			);
		}
	}

	logger.info(`Total matches updated: ${totalUpdated}`);
}

main();
