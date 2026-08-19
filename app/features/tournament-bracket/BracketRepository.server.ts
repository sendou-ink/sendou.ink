import { sql as kyselySql, type RawBuilder, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { jsonArrayFrom } from "~/utils/kysely.server";
import { matchStatuses } from "./core/engine/status";
import type {
	BracketData,
	EngineResult,
	GeneratedRound,
	ParticipantResult,
} from "./core/engine/types";

/**
 * Loads the full BracketData for a tournament (all stages). Includes the
 * score/totalKos aggregation over TournamentMatchGameResult. Direct replacement
 * for the old manager.get.tournamentData(); also called from write actions
 * inside their transaction (propagation must be computed from fresh rows, not
 * the cached Tournament instance).
 */
export async function findByTournamentId(
	tournamentId: number,
	trx?: Transaction<DB>,
): Promise<BracketData> {
	const executor = trx ?? db;

	const { stage, group, round, match } = await executor
		.selectNoFrom((eb) => [
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStage")
					.select([
						"TournamentStage.id",
						"TournamentStage.name",
						"TournamentStage.type",
						"TournamentStage.settings",
						"TournamentStage.number",
						"TournamentStage.createdAt",
					])
					.where("TournamentStage.tournamentId", "=", tournamentId)
					.orderBy("TournamentStage.id", "asc"),
			).as("stage"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentGroup")
					.innerJoin(
						"TournamentStage",
						"TournamentStage.id",
						"TournamentGroup.stageId",
					)
					.select([
						"TournamentGroup.id",
						"TournamentGroup.stageId",
						"TournamentGroup.number",
					])
					.where("TournamentStage.tournamentId", "=", tournamentId)
					.orderBy("TournamentGroup.stageId", "asc")
					.orderBy("TournamentGroup.id", "asc"),
			).as("group"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentRound")
					.innerJoin(
						"TournamentStage",
						"TournamentStage.id",
						"TournamentRound.stageId",
					)
					.select([
						"TournamentRound.id",
						"TournamentRound.stageId",
						"TournamentRound.groupId",
						"TournamentRound.number",
						"TournamentRound.maps",
						"TournamentRound.defaultPlayTime",
					])
					.where("TournamentStage.tournamentId", "=", tournamentId)
					.orderBy("TournamentRound.stageId", "asc")
					.orderBy("TournamentRound.id", "asc"),
			).as("round"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatch")
					.innerJoin(
						"TournamentStage",
						"TournamentStage.id",
						"TournamentMatch.stageId",
					)
					.leftJoin(
						"TournamentMatchGameResult",
						"TournamentMatch.id",
						"TournamentMatchGameResult.matchId",
					)
					.select([
						"TournamentMatch.id",
						"TournamentMatch.stageId",
						"TournamentMatch.groupId",
						"TournamentMatch.roundId",
						"TournamentMatch.number",
						"TournamentMatch.startedAt",
						"TournamentMatch.winnerSide",
						// totalKos is never persisted, it is aggregated fresh from the game results
						serializedOpponentWithKos("opponentOne").as("opponent1"),
						serializedOpponentWithKos("opponentTwo").as("opponent2"),
					])
					.where("TournamentStage.tournamentId", "=", tournamentId)
					.groupBy("TournamentMatch.id")
					.orderBy("TournamentMatch.stageId", "asc")
					.orderBy("TournamentMatch.id", "asc"),
			).as("match"),
		])
		.executeTakeFirstOrThrow();

	return { stage, group, round, match };
}

/**
 * Builds the opponent JSON with the freshly aggregated KO count: sets
 * `totalKos` to the SQL sum over the match's game results. Resolves to `null`
 * for BYEs (the column is `null`).
 */
function serializedOpponentWithKos(
	column: "opponentOne" | "opponentTwo",
): RawBuilder<ParticipantResult | null> {
	return kyselySql<ParticipantResult | null>`json_set(
		${kyselySql.ref(`TournamentMatch.${column}`)},
		'$.totalKos',
		sum(
			case
				when "TournamentMatchGameResult"."ko" = 1
					and "TournamentMatchGameResult"."winnerTeamId" = ${kyselySql.ref(`TournamentMatch.${column}`)} ->> '$.id'
				then 1
				else 0
			end
		)
	)`;
}

/**
 * Persists Engine.create output in one transaction. Inserts stage → groups →
 * rounds → matches, translating the engine's local ids to real row ids. The
 * stage number is assigned from the existing stages of the tournament.
 */
export function insertBracket(args: {
	tournamentId: number;
	name: string;
	bracket: BracketData;
}): Promise<{ stageId: number }> {
	const stageInput = args.bracket.stage[0];
	if (!stageInput) throw new Error("Bracket has no stage");

	return db.transaction().execute(async (trx) => {
		const stage = await trx
			.insertInto("TournamentStage")
			.values({
				tournamentId: args.tournamentId,
				name: args.name,
				type: stageInput.type,
				settings: JSON.stringify(stageInput.settings),
				number: kyselySql<number>`(select coalesce(max("number"), 0) + 1 from "TournamentStage" where "tournamentId" = ${args.tournamentId})`,
			})
			.returning(["id"])
			.executeTakeFirstOrThrow();

		if (
			args.bracket.group.length === 0 ||
			args.bracket.round.length === 0 ||
			args.bracket.match.length === 0
		) {
			throw new Error("Bracket is missing groups, rounds or matches");
		}

		const insertedGroups = await trx
			.insertInto("TournamentGroup")
			.values(
				args.bracket.group.map((group) => ({
					stageId: stage.id,
					number: group.number,
				})),
			)
			.returning(["id"])
			.execute();

		const groupIdMapping = zipInsertedIds(args.bracket.group, insertedGroups);

		if (args.bracket.round.some((round) => !round.maps)) {
			throw new Error("Round is missing maps");
		}

		const insertedRounds = await trx
			.insertInto("TournamentRound")
			.values(
				args.bracket.round.map((round) => ({
					stageId: stage.id,
					groupId: groupIdMapping.get(round.groupId)!,
					number: round.number,
					maps: JSON.stringify(round.maps),
				})),
			)
			.returning(["id"])
			.execute();

		const roundIdMapping = zipInsertedIds(args.bracket.round, insertedRounds);

		const statuses = matchStatuses(args.bracket);

		await trx
			.insertInto("TournamentMatch")
			.values(
				args.bracket.match.map((match) => ({
					stageId: stage.id,
					groupId: groupIdMapping.get(match.groupId)!,
					roundId: roundIdMapping.get(match.roundId)!,
					number: match.number,
					opponentOne: serializeOpponent(match.opponent1),
					opponentTwo: serializeOpponent(match.opponent2),
					winnerSide: match.winnerSide,
					chatCode: shortNanoid(),
					startedAt:
						statuses.get(match.id) === "STARTED"
							? databaseTimestampNow()
							: null,
				})),
			)
			.execute();

		return { stageId: stage.id };
	});
}

/**
 * UPDATEs the opponents of the changed matches and keeps startedAt in sync with
 * the statuses that the new state implies. Called inside the caller's
 * transaction with the bracket data the operation was computed from.
 */
export async function applyMatchChanges(
	args: { previousData: BracketData; result: EngineResult },
	trx: Transaction<DB>,
): Promise<void> {
	for (const match of args.result.changedMatches) {
		await trx
			.updateTable("TournamentMatch")
			.set({
				opponentOne: serializeOpponent(match.opponent1),
				opponentTwo: serializeOpponent(match.opponent2),
				winnerSide: match.winnerSide,
			})
			.where("id", "=", match.id)
			.execute();
	}

	await syncStartedAt(args.previousData, args.result.data, trx);
}

/**
 * A match starts when it stops being pending, which can also happen as a side
 * effect of another match's result (the teams of a round robin round becoming
 * free, an opponent advancing). Matches that were already started keep the
 * timestamp they got, and one that goes back to pending loses it.
 */
async function syncStartedAt(
	previousData: BracketData,
	data: BracketData,
	trx: Transaction<DB>,
): Promise<void> {
	const previousStatuses = matchStatuses(previousData);
	const statuses = matchStatuses(data);

	const wasPending = (matchId: number) =>
		previousStatuses.get(matchId) === "PENDING";
	const isPending = (matchId: number) => statuses.get(matchId) === "PENDING";

	const startedMatchIds = data.match
		.filter(
			(match) =>
				wasPending(match.id) && !isPending(match.id) && !match.startedAt,
		)
		.map((match) => match.id);

	const pendingMatchIds = data.match
		.filter(
			(match) =>
				!wasPending(match.id) && isPending(match.id) && match.startedAt,
		)
		.map((match) => match.id);

	if (startedMatchIds.length > 0) {
		await trx
			.updateTable("TournamentMatch")
			.set({ startedAt: databaseTimestampNow() })
			.where("id", "in", startedMatchIds)
			.execute();
	}

	if (pendingMatchIds.length > 0) {
		await trx
			.updateTable("TournamentMatch")
			.set({ startedAt: null })
			.where("id", "in", pendingMatchIds)
			.execute();
	}
}

/** INSERTs a generated round's matches (swiss advance). */
export async function insertRoundMatches(
	args: {
		stageId: number;
		round: GeneratedRound;
	},
	trx?: Transaction<DB>,
): Promise<void> {
	if (args.round.matches.length === 0) {
		throw new Error("No matches to insert");
	}

	const executor = trx ?? db;

	await executor
		.insertInto("TournamentMatch")
		.values(
			args.round.matches.map((match) => ({
				stageId: args.stageId,
				groupId: args.round.groupId,
				roundId: args.round.roundId,
				number: match.number,
				opponentOne: serializeOpponent(match.opponent1),
				opponentTwo: serializeOpponent(match.opponent2),
				winnerSide: null,
				chatCode: shortNanoid(),
				// swiss rounds are only generated once they can be played
				startedAt:
					match.opponent1?.id && match.opponent2?.id
						? databaseTimestampNow()
						: null,
			})),
		)
		.execute();
}

/** DELETEs a round's matches (swiss unadvance). */
export async function deleteRoundMatches(args: {
	groupId: number;
	roundId: number;
}): Promise<void> {
	await db
		.deleteFrom("TournamentMatch")
		.where("groupId", "=", args.groupId)
		.where("roundId", "=", args.roundId)
		.execute();
}

/** Deletes the whole stage subtree (matches, rounds, groups, stage). */
export function resetBracket(tournamentStageId: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("TournamentMatch")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentRound")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentGroup")
			.where("stageId", "=", tournamentStageId)
			.execute();

		await trx
			.deleteFrom("TournamentStage")
			.where("id", "=", tournamentStageId)
			.execute();
	});
}

/** Opponents are stored as JSON with the SQL-aggregated fields stripped (NULL for BYEs). */
function serializeOpponent(opponent: ParticipantResult | null): string | null {
	if (!opponent) return null;

	const { totalKos, ...persisted } = opponent;
	return JSON.stringify(persisted);
}

/**
 * Lines the ids of a multi-row insert back up with the rows they were inserted for. SQLite assigns
 * ids in insertion order, but RETURNING makes no ordering promise, so the ids are sorted first.
 */
function zipInsertedIds(
	sources: Array<{ id: number }>,
	inserted: Array<{ id: number }>,
) {
	const insertedIds = inserted.map((row) => row.id).sort((a, b) => a - b);

	return new Map(
		sources.map((source, i) => [source.id, insertedIds[i]] as const),
	);
}
