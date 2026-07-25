import {
	type Kysely,
	sql as kyselySql,
	type RawBuilder,
	type Transaction,
} from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import { matchStatuses } from "./core/engine/status";
import type {
	BracketData,
	EngineResult,
	GeneratedRound,
	ParticipantResult,
} from "./core/engine/types";

type DbOrTrx = Kysely<DB> | Transaction<DB>;

/**
 * Loads the full BracketData for a tournament (all stages). Includes the
 * score/totalKos aggregation over TournamentMatchGameResult. Direct replacement
 * for the old manager.get.tournamentData(); also called from write actions
 * inside their transaction (propagation must be computed from fresh rows, not
 * the cached Tournament instance).
 */
export async function findByTournamentId(
	tournamentId: number,
	trx: DbOrTrx = db,
): Promise<BracketData> {
	const { stage, group, round, match } = await trx
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
						// totalKos is re-aggregated fresh from the game results; the
						// totalKos/totalPoints that old write paths persisted into the
						// opponent JSON is stale residue and gets stripped/overwritten
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
 * Builds the opponent JSON with the freshly aggregated KO count: strips the
 * legacy `totalPoints` and overwrites `totalKos` with the SQL sum over the
 * match's game results. Resolves to `null` for BYEs (the column is `null`).
 */
function serializedOpponentWithKos(
	column: "opponentOne" | "opponentTwo",
): RawBuilder<ParticipantResult | null> {
	return kyselySql<ParticipantResult | null>`json_set(
		json_remove(${kyselySql.ref(`TournamentMatch.${column}`)}, '$.totalPoints'),
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
				createdAt: databaseTimestampNow(),
			})
			.returning(["id"])
			.executeTakeFirstOrThrow();

		const groupIdMapping = new Map<number, number>();
		const roundIdMapping = new Map<number, number>();

		for (const group of args.bracket.group) {
			const inserted = await trx
				.insertInto("TournamentGroup")
				.values({
					stageId: stage.id,
					number: group.number,
				})
				.returning(["id"])
				.executeTakeFirstOrThrow();

			groupIdMapping.set(group.id, inserted.id);
		}

		for (const round of args.bracket.round) {
			if (!round.maps) throw new Error("Round is missing maps");

			const inserted = await trx
				.insertInto("TournamentRound")
				.values({
					stageId: stage.id,
					groupId: groupIdMapping.get(round.groupId)!,
					number: round.number,
					maps: JSON.stringify(round.maps),
				})
				.returning(["id"])
				.executeTakeFirstOrThrow();

			roundIdMapping.set(round.id, inserted.id);
		}

		const statuses = matchStatuses(args.bracket);

		for (const match of args.bracket.match) {
			await trx
				.insertInto("TournamentMatch")
				.values({
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
				})
				.execute();
		}

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
	trx: DbOrTrx = db,
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
	trx: DbOrTrx,
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
	trx: DbOrTrx = db,
): Promise<void> {
	if (args.round.matches.length === 0) {
		throw new Error("No matches to insert");
	}

	await trx
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

	const { totalKos, totalPoints, ...persisted } =
		opponent as ParticipantResult & {
			totalPoints?: number;
		};
	return JSON.stringify(persisted);
}
