import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const rawTournamentTeamId = process.argv[2]?.trim();

invariant(rawTournamentTeamId, "tournament team is required (argument 1)");

const tournamentTeamId = Number(rawTournamentTeamId);

invariant(
	!Number.isNaN(tournamentTeamId),
	"tournament team id must be a number",
);

const deleteMapPoolStm = sql.prepare(/*sql*/ `
  delete from "MapPoolMap"
    where "tournamentTeamId" = @tournamentTeamId
`);

deleteMapPoolStm.run({ tournamentTeamId });

logger.info(`Deleted map pool of tournament team with id: ${tournamentTeamId}`);
