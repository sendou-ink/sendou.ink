import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  update "TournamentMatchGameResult"
  set "ko" = @ko
  where "id" = @id
`);

export function updateMatchGameResultKo({
	matchGameResultId,
	ko,
}: {
	matchGameResultId: number;
	ko: boolean;
}) {
	stm.run({ id: matchGameResultId, ko: Number(ko) });
}
