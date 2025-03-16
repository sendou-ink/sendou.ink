import { sql } from "~/db/sql";
import type { TournamentTeam } from "~/db/types";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";

const deleteCounterpickMapsByTeamIdStm = sql.prepare(/* sql */ `
  delete from
    "MapPoolMap"
  where
    "tournamentTeamId" = @tournamentTeamId
`);

const addCounterpickMapStm = sql.prepare(/* sql */ `
  insert into
    "MapPoolMap" ("tournamentTeamId", "stageId", "mode")
  values
    (@tournamentTeamId, @stageId, @mode)
`);

export const upsertCounterpickMaps = sql.transaction(
	({
		tournamentTeamId,
		mapPool,
	}: {
		tournamentTeamId: TournamentTeam["id"];
		mapPool: MapPool;
	}) => {
		deleteCounterpickMapsByTeamIdStm.run({ tournamentTeamId });

		for (const { stageId, mode } of mapPool.stageModePairs) {
			addCounterpickMapStm.run({
				tournamentTeamId,
				stageId,
				mode,
			});
		}
	},
);
