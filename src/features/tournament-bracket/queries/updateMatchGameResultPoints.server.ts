import { sql } from "~/db/sql";

const stm = sql.prepare(/* sql */ `
  update "TournamentMatchGameResult"
  set "opponentOnePoints" = @opponentOnePoints,
      "opponentTwoPoints" = @opponentTwoPoints
  where "id" = @id
`);

export function updateMatchGameResultPoints({
	matchGameResultId,
	opponentOnePoints,
	opponentTwoPoints,
}: {
	matchGameResultId: number;
	opponentOnePoints: number;
	opponentTwoPoints: number;
}) {
	stm.run({ id: matchGameResultId, opponentOnePoints, opponentTwoPoints });
}
