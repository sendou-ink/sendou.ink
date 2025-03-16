import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import type { ParsedMemento } from "~/db/tables";
import type { GroupMatch } from "~/db/types";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator";
import { syncGroupTeamId } from "./syncGroupTeamId.server";

const createMatchStm = sql.prepare(/* sql */ `
  insert into "GroupMatch" (
    "alphaGroupId",
    "bravoGroupId",
    "chatCode",
    "memento"
  ) values (
    @alphaGroupId,
    @bravoGroupId,
    @chatCode,
    @memento
  )
  returning *
`);

const createMatchMapStm = sql.prepare(/* sql */ `
  insert into "GroupMatchMap" (
    "matchId",
    "index",
    "mode",
    "stageId",
    "source"
  ) values (
    @matchId,
    @index,
    @mode,
    @stageId,
    @source
  )
`);

export const createMatch = sql.transaction(
	({
		alphaGroupId,
		bravoGroupId,
		mapList,
		memento,
	}: {
		alphaGroupId: number;
		bravoGroupId: number;
		mapList: TournamentMapListMap[];
		memento: ParsedMemento;
	}) => {
		const match = createMatchStm.get({
			alphaGroupId,
			bravoGroupId,
			chatCode: nanoid(10),
			memento: JSON.stringify(memento),
		}) as GroupMatch;

		for (const [i, { mode, source, stageId }] of mapList.entries()) {
			createMatchMapStm.run({
				matchId: match.id,
				index: i,
				mode,
				stageId,
				source: String(source),
			});
		}

		syncGroupTeamId(alphaGroupId);
		syncGroupTeamId(bravoGroupId);

		return match;
	},
);
