import { db } from "~/db/sql";
import * as Seasons from "~/features/mmr/core/Seasons";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const discordId = process.argv[2]?.trim();

invariant(discordId, "discord id is required (argument 1)");

const currentSeasonNth = Seasons.currentOrPrevious()?.nth;

invariant(currentSeasonNth, "current season nth is required");

await db
	.updateTable("User")
	.set({ plusSkippedForSeasonNth: currentSeasonNth })
	.where("discordId", "=", discordId)
	.execute();

logger.info(
	`Plus Server admission will be skipped for Discord ID: ${discordId} (season ${currentSeasonNth})`,
);
