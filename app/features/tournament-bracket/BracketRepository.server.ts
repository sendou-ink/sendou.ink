import { type Kysely, sql as kyselySql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import type {
	BracketData,
	GeneratedRound,
	MatchData,
	MatchStatus,
	ParticipantResult,
	RoundData,
} from "./core/engine/types";
import { MatchStatus as MatchStatusValues } from "./core/engine/types";

type DbOrTrx = Kysely<DB> | Transaction<DB>;

/**
 * Loads the full BracketData for a tournament (all stages). Includes the
 * score/totalKos aggregation over TournamentMatchGameResult. Direct replacement
 * for the old manager.get.tournamentData(); also called from write actions
 * inside their transaction (propagation must be computed from fresh rows, not
 * the cached Tournament instance).
 */
// xxx: one query with json helpers
export async function findByTournamentId(
	tournamentId: number,
	trx: DbOrTrx = db,
): Promise<BracketData> {
	const stages = await trx
		.selectFrom("TournamentStage")
		.selectAll()
		.where("tournamentId", "=", tournamentId)
		.orderBy("id", "asc")
		.execute();

	if (stages.length === 0) {
		return { stage: [], group: [], round: [], match: [] };
	}

	const stageIds = stages.map((stage) => stage.id);

	const [groups, rounds, matches] = await Promise.all([
		trx
			.selectFrom("TournamentGroup")
			.selectAll()
			.where("stageId", "in", stageIds)
			.orderBy("stageId", "asc")
			.orderBy("id", "asc")
			.execute(),
		trx
			.selectFrom("TournamentRound")
			.selectAll()
			.where("stageId", "in", stageIds)
			.orderBy("stageId", "asc")
			.orderBy("id", "asc")
			.execute(),
		trx
			.selectFrom("TournamentMatch")
			.leftJoin(
				"TournamentMatchGameResult",
				"TournamentMatch.id",
				"TournamentMatchGameResult.matchId",
			)
			.selectAll("TournamentMatch")
			.select([
				kyselySql<
					number | null
				>`sum(case when "TournamentMatchGameResult"."opponentOnePoints" = 100 and "TournamentMatchGameResult"."opponentTwoPoints" = 0 then 1 else 0 end)`.as(
					"opponentOneKosTotal",
				),
				kyselySql<
					number | null
				>`sum(case when "TournamentMatchGameResult"."opponentTwoPoints" = 100 and "TournamentMatchGameResult"."opponentOnePoints" = 0 then 1 else 0 end)`.as(
					"opponentTwoKosTotal",
				),
			])
			.where("TournamentMatch.stageId", "in", stageIds)
			.groupBy("TournamentMatch.id")
			.orderBy("TournamentMatch.stageId", "asc")
			.orderBy("TournamentMatch.id", "asc")
			.execute(),
	]);

	return {
		stage: stages.map((stage) => ({
			id: stage.id,
			tournament_id: stage.tournamentId,
			name: stage.name,
			type: stage.type,
			settings: stage.settings ?? {},
			number: stage.number,
			createdAt: stage.createdAt,
		})),
		group: groups.map((group) => ({
			id: group.id,
			stage_id: group.stageId,
			number: group.number,
		})),
		round: rounds.map((round) => ({
			id: round.id,
			stage_id: round.stageId,
			group_id: round.groupId,
			number: round.number,
			maps: round.maps
				? {
						count: round.maps.count,
						type: round.maps.type,
						pickBan: round.maps.pickBan,
					}
				: null,
		})),
		match: matches.map((match) => ({
			id: match.id,
			stage_id: match.stageId,
			group_id: match.groupId,
			round_id: match.roundId,
			number: match.number,
			status: match.status as MatchStatus,
			opponent1: hydrateOpponent(match.opponentOne, match.opponentOneKosTotal),
			opponent2: hydrateOpponent(match.opponentTwo, match.opponentTwoKosTotal),
			startedAt: match.startedAt,
		})),
	};
}

/**
 * Persists Engine.create output in one transaction. Inserts stage → groups →
 * rounds → matches, translating the engine's local ids to real row ids. The
 * stage number is assigned from the existing stages of the tournament.
 *
 * @returns the created stage id and the created round rows (with real ids),
 * needed for the round map-list assignment.
 */
export async function insertBracket(
	args: {
		tournamentId: number;
		bracket: BracketData;
	},
	trx: DbOrTrx = db,
): Promise<{ stageId: number; rounds: RoundData[] }> {
	const stageInput = args.bracket.stage[0];
	if (!stageInput) throw new Error("Bracket has no stage");

	const stage = await trx
		.insertInto("TournamentStage")
		.values({
			tournamentId: args.tournamentId,
			name: stageInput.name,
			type: stageInput.type,
			settings: JSON.stringify(stageInput.settings),
			number: kyselySql<number>`(select coalesce(max("number"), 0) + 1 from "TournamentStage" where "tournamentId" = ${args.tournamentId})`,
			createdAt: databaseTimestampNow(),
		})
		.returning(["id"])
		.executeTakeFirstOrThrow();

	const groupIdMapping = new Map<number, number>();
	const roundIdMapping = new Map<number, number>();
	const insertedRounds: RoundData[] = [];

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
		const inserted = await trx
			.insertInto("TournamentRound")
			.values({
				stageId: stage.id,
				groupId: groupIdMapping.get(round.group_id)!,
				number: round.number,
				// the maps column is filled right after bracket creation; typed
				// non-null but nullable at the DB level
				maps: kyselySql<string>`null`,
			})
			.returning(["id"])
			.executeTakeFirstOrThrow();

		roundIdMapping.set(round.id, inserted.id);
		insertedRounds.push({
			id: inserted.id,
			stage_id: stage.id,
			group_id: groupIdMapping.get(round.group_id)!,
			number: round.number,
		});
	}

	for (const match of args.bracket.match) {
		await trx
			.insertInto("TournamentMatch")
			.values({
				stageId: stage.id,
				groupId: groupIdMapping.get(match.group_id)!,
				roundId: roundIdMapping.get(match.round_id)!,
				number: match.number,
				status: match.status,
				opponentOne: serializeOpponent(match.opponent1),
				opponentTwo: serializeOpponent(match.opponent2),
				chatCode: shortNanoid(),
				startedAt: null,
			})
			.execute();
	}

	return { stageId: stage.id, rounds: insertedRounds };
}

/**
 * UPDATEs the given matches' status/opponentOne/opponentTwo. Called with
 * EngineResult.changedMatches, inside the caller's transaction.
 */
export async function applyMatchChanges(
	changes: MatchData[],
	trx: DbOrTrx = db,
): Promise<void> {
	for (const match of changes) {
		await trx
			.updateTable("TournamentMatch")
			.set({
				status: match.status,
				opponentOne: serializeOpponent(match.opponent1),
				opponentTwo: serializeOpponent(match.opponent2),
			})
			.where("id", "=", match.id)
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
				status: MatchStatusValues.Ready,
				opponentOne: serializeOpponent(match.opponent1),
				opponentTwo: serializeOpponent(match.opponent2),
				chatCode: shortNanoid(),
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

function hydrateOpponent(
	opponent: (ParticipantResult & { totalPoints?: number }) | null,
	kosTotal: number | null,
): ParticipantResult | null {
	if (!opponent) return null;

	// old write paths serialized the aggregated fields into the JSON; they are
	// stale residue and must not shadow the fresh aggregation
	const { totalPoints, totalKos, ...persisted } = opponent;

	return {
		...persisted,
		totalKos: kosTotal ?? undefined,
	};
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
