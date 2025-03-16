import { sql } from "~/db/sql";
import type { MapResult } from "~/db/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists";

const stm = sql.prepare(/* sql */ `
  select
    *
  from
    "MapResult"
  where
    "MapResult"."userId" = @userId
    and "MapResult"."season" = @season
`);

export function seasonStagesByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	const rows = stm.all({ userId, season }) as Array<MapResult>;

	return rows.reduce(
		(acc, cur) => {
			if (!acc[cur.stageId]) acc[cur.stageId] = {};

			acc[cur.stageId]![cur.mode] = {
				wins: cur.wins,
				losses: cur.losses,
			};

			return acc;
		},
		{} as Partial<
			Record<
				StageId,
				Partial<
					Record<
						ModeShort,
						{
							wins: number;
							losses: number;
						}
					>
				>
			>
		>,
	);
}
