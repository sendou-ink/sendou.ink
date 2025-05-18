import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

// only to be used if tournament didn't have skills etc. calculated

const id = process.argv[2]?.trim();

invariant(id, "id of tournament is required (argument 1)");

sql
	.prepare(
		`delete from "TournamentResult" where "TournamentResult"."tournamentId" = @id`,
	)
	.run({ id });

logger.info(`Reopened tournament with id ${id}`);
