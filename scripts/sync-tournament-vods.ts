// usage: npx tsx ./scripts/sync-tournament-vods.ts <tournamentId>
import "dotenv/config";
import { processOneTournament } from "~/routines/syncTournamentVods";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const tournamentId = Number(process.argv[2]?.trim());
invariant(
	tournamentId && !Number.isNaN(tournamentId),
	"tournament id is required (argument 1)",
);

logger.info(`Syncing VODs for tournament ${tournamentId}...`);
await processOneTournament(tournamentId);
logger.info("Done");
