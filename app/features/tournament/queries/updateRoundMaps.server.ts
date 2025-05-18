import { sql } from "~/db/sql";
import type { TournamentRoundMaps } from "~/db/tables";

const stm = sql.prepare(/*sql*/ `
  update "TournamentRound"
  set "maps" = @maps
  where "id" = @roundId
`);

export function updateRoundMaps(
	args: (TournamentRoundMaps & { roundId: number })[],
) {
	for (const { roundId, ...rest } of args) {
		stm.run({
			maps: JSON.stringify(rest),
			roundId,
		});
	}
}
