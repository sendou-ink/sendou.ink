import { sql } from "~/db/sql";
import type { MapPoolMap } from "~/db/types";
import { parseDBArray } from "~/utils/sql";

const stm = sql.prepare(/*sql*/ `
  select
    "MapPoolMap"."tournamentTeamId",
    json_group_array(
      json_object(
        'stageId', "MapPoolMap"."stageId",
        'mode', "MapPoolMap"."mode"
      )
    ) as "mapPool"
  from "TournamentTeam"
  inner join "MapPoolMap" on "MapPoolMap"."tournamentTeamId" = "TournamentTeam"."id"
  where
    "TournamentTeam"."tournamentId" = @tournamentId
  group by "TournamentTeam"."id"
`);

interface FindMapPoolsByTournamentIdItem {
	tournamentTeamId: number;
	mapPool: Array<Pick<MapPoolMap, "mode" | "stageId">>;
}

export function findMapPoolsByTournamentId(
	tournamentId: number,
): FindMapPoolsByTournamentIdItem[] {
	const rows = stm.all({ tournamentId }) as any[];

	return rows.map((row) => {
		return {
			tournamentTeamId: row.tournamentTeamId,
			mapPool: parseDBArray(row.mapPool),
		};
	});
}
