import "dotenv/config";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";

async function main() {
	if (Seasons.current()) {
		throw new Error("There is a current season");
	}

	if (Seasons.next()?.nth !== 8) {
		throw new Error("Next season is not 8. Script needs modifying");
	}

	const wrongSeasonStartDate = new Date("2025-06-14T18:00:00.000Z");

	const allMatches = await db
		.selectFrom("GroupMatch")
		.selectAll()
		.where(
			"GroupMatch.createdAt",
			">=",
			dateToDatabaseTimestamp(wrongSeasonStartDate),
		)
		.execute();

	await db
		.deleteFrom("Skill")
		.where(
			"Skill.groupMatchId",
			"in",
			allMatches.map((m) => m.id),
		)
		.execute();

	for (const match of allMatches) {
		await SQMatchRepository.lockMatchWithoutSkillChange(match.id);
	}

	logger.info(`All done with nuking the season (${allMatches.length} matches)`);
}

void main();
