import { sql } from "~/db/sql";
import type { GroupMatch, GroupMatchMap, ParsedMemento } from "~/db/types";
import { parseDBJsonArray } from "~/utils/sql";

const stm = sql.prepare(/* sql */ `
  select
    "GroupMatch"."id",
    "GroupMatch"."alphaGroupId",
    "GroupMatch"."bravoGroupId",
    "GroupMatch"."createdAt",
    "GroupMatch"."reportedAt",
    "GroupMatch"."reportedByUserId",
    "GroupMatch"."chatCode",
    "GroupMatch"."memento",
    (select exists (select 1 from "Skill" where "Skill"."groupMatchId" = @id)) as "isLocked",
    json_group_array(
      json_object(
        'id', "GroupMatchMap"."id",
        'mode', "GroupMatchMap"."mode",
        'stageId', "GroupMatchMap"."stageId",
        'source', "GroupMatchMap"."source",
        'winnerGroupId', "GroupMatchMap"."winnerGroupId"
      )
    ) as "mapList"
  from "GroupMatch"
  left join "GroupMatchMap" on "GroupMatchMap"."matchId" = "GroupMatch"."id"
  where "GroupMatch"."id" = @id
  group by "GroupMatch"."id"
  order by "GroupMatchMap"."index" asc
`);

export interface MatchById {
	id: GroupMatch["id"];
	alphaGroupId: GroupMatch["alphaGroupId"];
	bravoGroupId: GroupMatch["bravoGroupId"];
	createdAt: GroupMatch["createdAt"];
	reportedAt: GroupMatch["reportedAt"];
	reportedByUserId: GroupMatch["reportedByUserId"];
	chatCode: GroupMatch["chatCode"];
	isLocked: boolean;
	memento: ParsedMemento;
	mapList: Array<
		Pick<GroupMatchMap, "id" | "mode" | "stageId" | "source" | "winnerGroupId">
	>;
}

export function findMatchById(id: number) {
	const row = stm.get({ id }) as any;
	if (!row) return null;

	return {
		...row,
		mapList: parseDBJsonArray(row.mapList),
		isLocked: Boolean(row.isLocked),
		memento: row.memento ? JSON.parse(row.memento) : null,
	} as MatchById;
}
