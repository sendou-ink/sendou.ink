import "dotenv/config";
import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const rawNth = process.argv[2]?.trim();

const season = rawNth
	? (() => {
			const nth = Number(rawNth);
			invariant(!Number.isNaN(nth), "nth must be a number");
			const seasonData = Seasons.list.find((s) => s.nth === nth);
			invariant(seasonData, `Season ${nth} not found`);
			return seasonData;
		})()
	: Seasons.currentOrPrevious();

invariant(season, "No season found");

logger.info(`Checking status for season ${season.nth}`);
logger.info(
	`Season period: ${season.starts.toISOString()} - ${season.ends.toISOString()}`,
);

const activeMatches = await db
	.selectFrom("GroupMatch")
	.leftJoin("Skill", "Skill.groupMatchId", "GroupMatch.id")
	.select("GroupMatch.id")
	.where("Skill.id", "is", null)
	.execute();

const activeMatchIds = activeMatches.map((row) => row.id);

if (activeMatchIds.length > 0) {
	logger.info(
		`Active matches (${activeMatchIds.length}): ${activeMatchIds.join(", ")}`,
	);
} else {
	logger.info("No active matches found");
}

const seasonStartTimestamp = Math.floor(season.starts.getTime() / 1000);
const seasonEndTimestamp = Math.floor(season.ends.getTime() / 1000);

const tournaments = await db
	.selectFrom("Tournament")
	.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
	.innerJoin(
		"CalendarEventDate",
		"CalendarEventDate.eventId",
		"CalendarEvent.id",
	)
	.select([
		"Tournament.id",
		"Tournament.settings",
		"Tournament.isFinalized",
		"CalendarEvent.name",
		"CalendarEventDate.startTime",
	])
	.where("CalendarEventDate.startTime", ">=", seasonStartTimestamp)
	.where("CalendarEventDate.startTime", "<=", seasonEndTimestamp)
	.orderBy("CalendarEventDate.startTime")
	.execute();

const unfinalizedTournaments = tournaments.filter(
	(t) => t.settings.isRanked && !t.settings.isTest && !t.isFinalized,
);

if (unfinalizedTournaments.length > 0) {
	logger.info(
		`Unfinalized ranked tournaments (${unfinalizedTournaments.length}):`,
	);
	for (const tournament of unfinalizedTournaments) {
		const date = new Date(tournament.startTime * 1000).toISOString();
		logger.info(`  - ID ${tournament.id}: "${tournament.name}" (${date})`);
	}
} else {
	logger.info("No unfinalized ranked tournaments found");
}

if (activeMatchIds.length > 0 || unfinalizedTournaments.length > 0) {
	logger.warn("Season cannot be closed yet");
} else {
	logger.info("Season is ready to be closed");
}
