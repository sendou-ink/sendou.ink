import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import type { Tables } from "~/db/tables";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";

const createTournamentStageStm = sql.prepare(/* sql */ `
  insert into "TournamentStage" (
    "tournamentId",
    "type",
    "createdAt",
    "settings",
    "number",
    "name"
  ) values (
    @tournamentId,
    @type,
    @createdAt,
    @settings,
    @number,
    @name
  ) returning *
`);

const createTournamentGroupStm = sql.prepare(/* sql */ `
  insert into "TournamentGroup" (
    "number",
    "stageId"
  ) values (
    @number,
    @stageId
  ) returning *
`);

const createTournamentRoundStm = sql.prepare(/* sql */ `
  insert into "TournamentRound" (
    "groupId",
    "number",
    "stageId"
  ) values (
    @groupId,
    @number,
    @stageId
  ) returning *
`);

const createTournamentMatchStm = sql.prepare(/* sql */ `
  insert into "TournamentMatch" (
    "chatCode",
    "groupId",
    "number",
    "opponentOne",
    "opponentTwo",
    "roundId",
    "stageId",
    "status",
    "createdAt"
  ) values (
    @chatCode,
    @groupId,
    @number,
    @opponentOne,
    @opponentTwo,
    @roundId,
    @stageId,
    @status,
    @createdAt
  )
`);

export function createSwissBracketInTransaction(
	input: TournamentManagerDataSet,
) {
	const stageInput = input.stage[0];
	invariant(stageInput, "Stage input is required");
	invariant(stageInput.type === "swiss", "Invalid stage type");

	const stageFromDB = createTournamentStageStm.get({
		tournamentId: stageInput.tournament_id,
		type: stageInput.type,
		createdAt: dateToDatabaseTimestamp(new Date()),
		settings: JSON.stringify(stageInput.settings),
		number: stageInput.number,
		name: stageInput.name,
	}) as Tables["TournamentStage"];

	for (const group of input.group) {
		const groupFromDB = createTournamentGroupStm.get({
			number: group.number,
			stageId: stageFromDB.id,
		}) as Tables["TournamentGroup"];

		for (const round of input.round) {
			if (round.group_id !== group.id) {
				continue;
			}

			const roundFromDB = createTournamentRoundStm.get({
				groupId: groupFromDB.id,
				number: round.number,
				stageId: stageFromDB.id,
			}) as Tables["TournamentRound"];

			for (const match of input.match) {
				if (match.round_id !== round.id) {
					continue;
				}

				createTournamentMatchStm.run({
					chatCode: nanoid(10),
					groupId: groupFromDB.id,
					number: match.number,
					opponentOne: match.opponent1
						? JSON.stringify(match.opponent1)
						: "null",
					opponentTwo: match.opponent2
						? JSON.stringify(match.opponent2)
						: "null",
					roundId: roundFromDB.id,
					stageId: stageFromDB.id,
					status: match.status,
					createdAt: dateToDatabaseTimestamp(new Date()),
				});
			}
		}
	}

	return stageFromDB;
}
