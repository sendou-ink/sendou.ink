import { addDays } from "date-fns";
import {
	sql as kyselySql,
	type NotNull,
	type RawBuilder,
	type Transaction,
} from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { jsonArrayFrom } from "~/utils/kysely.server";
import { matchStatuses } from "./core/engine/status";
import type {
	BracketData,
	EngineResult,
	GeneratedRound,
	ParticipantResult,
} from "./core/engine/types";

const CHAT_ROOM_LIFESPAN_DAYS = 7;
// league rounds can be scheduled weeks out and all rooms are created on insertBracket
const LEAGUE_CHAT_ROOM_LIFESPAN_DAYS = 30;

/**
 * Full BracketData of all stages, with score/totalKos aggregated over TournamentMatchGameResult.
 * Also called inside write transactions: propagation needs fresh rows, not the cached Tournament.
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

/** Opponent JSON with `totalKos` summed over the match's game results, `null` for BYEs. */
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

/** Persists Engine.create output, translating local ids to row ids. Stage number follows the existing stages. */
export function insertBracket(args: {
	tournamentId: number;
	name: string;
	bracket: BracketData;
	/** League rounds are all playable from the start, so their chat rooms live longer. */
	isLeague: boolean;
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

		// only playable matches get a chat room now, the rest as they start (see syncStartedAt).
		// A league's rounds are independent so every match is playable right away
		const startedMatches = args.bracket.match.filter(
			(match) => statuses.get(match.id) === "STARTED",
		);
		const startedChatRoomIds = await insertMatchChatRooms(
			{ count: startedMatches.length, isLeague: args.isLeague },
			trx,
		);
		const chatRoomIdByMatchId = new Map(
			startedMatches.map((match, i) => [match.id, startedChatRoomIds[i]]),
		);

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
					chatRoomId: chatRoomIdByMatchId.get(match.id) ?? null,
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
 * UPDATEs the changed matches' opponents and syncs startedAt with the implied statuses. Called inside
 * the caller's transaction with the bracket data the operation was computed from.
 *
 * @returns ids of the chat rooms whose inactive flag changed, to notify participants of after commit
 */
export async function applyMatchChanges(
	args: {
		previousData: BracketData;
		result: EngineResult;
		/** League rounds are all playable from the start, so their chat rooms live longer. */
		isLeague: boolean;
	},
	trx: Transaction<DB>,
): Promise<number[]> {
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

	await syncStartedAt(
		{
			previousData: args.previousData,
			data: args.result.data,
			isLeague: args.isLeague,
		},
		trx,
	);

	return syncChatRoomInactive(args.previousData, args.result.data, trx);
}

/**
 * A match starts when it stops being pending, possibly as a side effect of another match's result.
 * Already started matches keep their timestamp, one going back to pending loses it.
 */
async function syncStartedAt(
	args: { previousData: BracketData; data: BracketData; isLeague: boolean },
	trx: Transaction<DB>,
): Promise<void> {
	const { previousData, data } = args;
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

		// a match reverted to pending keeps its room, so only fill the gaps
		const roomlessMatches = await trx
			.selectFrom("TournamentMatch")
			.select(["TournamentMatch.id"])
			.where("TournamentMatch.id", "in", startedMatchIds)
			.where("TournamentMatch.chatRoomId", "is", null)
			.execute();
		const chatRoomIds = await insertMatchChatRooms(
			{ count: roomlessMatches.length, isLeague: args.isLeague },
			trx,
		);
		for (const [i, match] of roomlessMatches.entries()) {
			await trx
				.updateTable("TournamentMatch")
				.set({ chatRoomId: chatRoomIds[i] })
				.where("TournamentMatch.id", "=", match.id)
				.execute();
		}
	}

	if (pendingMatchIds.length > 0) {
		await trx
			.updateTable("TournamentMatch")
			.set({ startedAt: null })
			.where("id", "in", pendingMatchIds)
			.execute();
	}
}

/**
 * Completing marks the chat room inactive, losing the winner again (reopen, undone final game) reactivates it.
 *
 * @returns ids of the rewritten chat rooms
 */
async function syncChatRoomInactive(
	previousData: BracketData,
	data: BracketData,
	trx: Transaction<DB>,
): Promise<number[]> {
	const previousStatuses = matchStatuses(previousData);
	const statuses = matchStatuses(data);

	const wasCompleted = (matchId: number) =>
		previousStatuses.get(matchId) === "COMPLETED";
	const isCompleted = (matchId: number) =>
		statuses.get(matchId) === "COMPLETED";

	const completedMatchIds = data.match
		.filter((match) => !wasCompleted(match.id) && isCompleted(match.id))
		.map((match) => match.id);
	const reopenedMatchIds = data.match
		.filter((match) => wasCompleted(match.id) && !isCompleted(match.id))
		.map((match) => match.id);

	return [
		...(await updateMatchChatRoomsInactive(completedMatchIds, true, trx)),
		...(await updateMatchChatRoomsInactive(reopenedMatchIds, false, trx)),
	];
}

async function updateMatchChatRoomsInactive(
	matchIds: number[],
	inactive: boolean,
	trx: Transaction<DB>,
): Promise<number[]> {
	if (matchIds.length === 0) return [];

	const matches = await trx
		.selectFrom("TournamentMatch")
		.select(["TournamentMatch.chatRoomId"])
		.where("TournamentMatch.id", "in", matchIds)
		.where("TournamentMatch.chatRoomId", "is not", null)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();

	const chatRoomIds = matches.map((match) => match.chatRoomId);
	await ChatRepository.updateRoomsInactive(chatRoomIds, inactive, trx);

	return chatRoomIds;
}

/** INSERTs a generated round's matches (swiss advance). */
export async function insertRoundMatches(
	args: {
		stageId: number;
		round: GeneratedRound;
		/** League rounds are all playable from the start, so their chat rooms live longer. */
		isLeague: boolean;
	},
	trx?: Transaction<DB>,
): Promise<void> {
	if (args.round.matches.length === 0) {
		throw new Error("No matches to insert");
	}

	if (!trx) {
		return db
			.transaction()
			.execute((newTrx) => insertRoundMatches(args, newTrx));
	}

	const playableMatches = args.round.matches.filter(hasBothOpponents);
	const chatRoomIds = await insertMatchChatRooms(
		{ count: playableMatches.length, isLeague: args.isLeague },
		trx,
	);
	const chatRoomIdByMatch = new Map(
		playableMatches.map((match, i) => [match, chatRoomIds[i]]),
	);

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
				chatRoomId: chatRoomIdByMatch.get(match) ?? null,
				// swiss rounds are only generated once they can be played
				startedAt: hasBothOpponents(match) ? databaseTimestampNow() : null,
			})),
		)
		.execute();
}

/** DELETEs a round's matches (swiss unadvance). */
export async function deleteRoundMatches(args: {
	groupId: number;
	roundId: number;
}): Promise<void> {
	await db.transaction().execute(async (trx) => {
		const matches = await trx
			.selectFrom("TournamentMatch")
			.select(["TournamentMatch.chatRoomId"])
			.where("groupId", "=", args.groupId)
			.where("roundId", "=", args.roundId)
			.execute();
		await ChatRepository.deleteRoomsByIds(
			matches.map((match) => match.chatRoomId),
			trx,
		);

		await trx
			.deleteFrom("TournamentMatch")
			.where("groupId", "=", args.groupId)
			.where("roundId", "=", args.roundId)
			.execute();
	});
}

/** Deletes the whole stage subtree (matches, rounds, groups, stage). */
export function resetBracket(tournamentStageId: number) {
	return db.transaction().execute(async (trx) => {
		const matches = await trx
			.selectFrom("TournamentMatch")
			.select(["TournamentMatch.chatRoomId"])
			.where("stageId", "=", tournamentStageId)
			.execute();
		await ChatRepository.deleteRoomsByIds(
			matches.map((match) => match.chatRoomId),
			trx,
		);

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

function insertMatchChatRooms(
	args: { count: number; isLeague: boolean },
	trx: Transaction<DB>,
) {
	return ChatRepository.insertRooms(
		{
			type: "TOURNAMENT_MATCH",
			expiresAt: addDays(
				new Date(),
				args.isLeague
					? LEAGUE_CHAT_ROOM_LIFESPAN_DAYS
					: CHAT_ROOM_LIFESPAN_DAYS,
			),
			count: args.count,
		},
		trx,
	);
}

function hasBothOpponents(match: GeneratedRound["matches"][number]) {
	return Boolean(match.opponent1?.id && match.opponent2?.id);
}

/** SQLite assigns ids in insertion order but RETURNING makes no ordering promise, so the ids are sorted first. */
function zipInsertedIds(
	sources: Array<{ id: number }>,
	inserted: Array<{ id: number }>,
) {
	const insertedIds = inserted.map((row) => row.id).sort((a, b) => a - b);

	return new Map(
		sources.map((source, i) => [source.id, insertedIds[i]] as const),
	);
}
