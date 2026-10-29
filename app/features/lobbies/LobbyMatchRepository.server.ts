import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import { commonUserSelect, jsonArrayFrom } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import * as LobbySet from "./core/LobbySet";
import type { LobbySide } from "./lobbies-constants";
import { lobbyChatRoomExpiresAt } from "./lobbies-utils";

/** A set of the lobby with its games and participants, see {@link findAllSetsByLobbyId}. */
export type LobbySetWithGames = Unwrapped<typeof findAllSetsByLobbyId>;

/** Every set of the lobby, oldest first, with its maps and who played on which side (with their user info). */
export function findAllSetsByLobbyId(lobbyId: number) {
	return db
		.selectFrom("LobbySet")
		.select((eb) => [
			"LobbySet.id",
			"LobbySet.bestOf",
			"LobbySet.forfeitingSide",
			"LobbySet.disputedAt",
			"LobbySet.confirmedAt",
			"LobbySet.alphaChatRoomId",
			"LobbySet.bravoChatRoomId",
			"LobbySet.createdAt",
			jsonArrayFrom(
				eb
					.selectFrom("LobbyGame")
					.select([
						"LobbyGame.id",
						"LobbyGame.index",
						"LobbyGame.mode",
						"LobbyGame.stageId",
						"LobbyGame.winnerSide",
						"LobbyGame.reportedAt",
						"LobbyGame.reportedByUserId",
					])
					.whereRef("LobbyGame.setId", "=", "LobbySet.id")
					.orderBy("LobbyGame.index", "asc"),
			).as("games"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbySetParticipant")
					.innerJoin("User", "User.id", "LobbySetParticipant.userId")
					.select((innerEb) => [
						"LobbySetParticipant.userId",
						"LobbySetParticipant.side",
						...commonUserSelect(innerEb),
						"User.inGameName",
					])
					.whereRef("LobbySetParticipant.setId", "=", "LobbySet.id"),
			).as("participants"),
		])
		.where("LobbySet.lobbyId", "=", lobbyId)
		.orderBy("LobbySet.id", "asc")
		.execute();
}

/**
 * Sets owning the given team chat rooms, with the players of the side the chat room is for who are still in the
 * lobby's room. A finished set's team chats are inactive.
 */
export async function findAllTeamChatsByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	const sets = await db
		.selectFrom("LobbySet")
		.innerJoin("Lobby", "Lobby.id", "LobbySet.lobbyId")
		.select((eb) => [
			"Lobby.id as lobbyId",
			"Lobby.name as lobbyName",
			"Lobby.endedAt",
			"LobbySet.alphaChatRoomId",
			"LobbySet.bravoChatRoomId",
			"LobbySet.confirmedAt",
			"LobbySet.forfeitingSide",
			jsonArrayFrom(
				eb
					.selectFrom("LobbySetParticipant")
					.select(["LobbySetParticipant.userId", "LobbySetParticipant.side"])
					.whereRef("LobbySetParticipant.setId", "=", "LobbySet.id")
					.where((innerEb) =>
						innerEb.exists(
							innerEb
								.selectFrom("LobbyParticipant")
								.select("LobbyParticipant.id")
								.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
								.whereRef(
									"LobbyParticipant.userId",
									"=",
									"LobbySetParticipant.userId",
								)
								.where("LobbyParticipant.status", "=", "IN_ROOM"),
						),
					),
			).as("participants"),
		])
		.where((eb) =>
			eb.or([
				eb("LobbySet.alphaChatRoomId", "in", chatRoomIds),
				eb("LobbySet.bravoChatRoomId", "in", chatRoomIds),
			]),
		)
		.execute();

	return sets.flatMap((set) =>
		(["ALPHA", "BRAVO"] as const).flatMap((side) => {
			const chatRoomId =
				side === "ALPHA" ? set.alphaChatRoomId : set.bravoChatRoomId;
			if (chatRoomId === null || !chatRoomIds.includes(chatRoomId)) return [];

			return [
				{
					chatRoomId,
					side,
					lobbyId: set.lobbyId,
					lobbyName: set.lobbyName,
					isInactive:
						set.endedAt !== null ||
						set.confirmedAt !== null ||
						set.forfeitingSide !== null,
					userIds: set.participants
						.filter((participant) => participant.side === side)
						.map((participant) => participant.userId),
				},
			];
		}),
	);
}

/**
 * Starts a set in the room: who plays on which side (the rest sit out), the maps and fresh team chats. Returns the set id.
 */
export function insertSet({
	lobbyId,
	bestOf,
	maps,
	alpha,
	bravo,
	sittingOut,
}: {
	lobbyId: number;
	bestOf: Tables["LobbySet"]["bestOf"];
	maps: ModeWithStage[];
	alpha: number[];
	bravo: number[];
	sittingOut: number[];
}) {
	return db.transaction().execute(async (trx) => {
		const lobby = await trx
			.selectFrom("Lobby")
			.select("Lobby.startsAt")
			.where("Lobby.id", "=", lobbyId)
			.executeTakeFirstOrThrow();
		const [alphaChatRoomId, bravoChatRoomId] = await ChatRepository.insertRooms(
			{
				type: "LOBBY_TEAM",
				expiresAt: lobbyChatRoomExpiresAt(lobby.startsAt),
				count: 2,
			},
			trx,
		);

		const set = await trx
			.insertInto("LobbySet")
			.values({ lobbyId, bestOf, alphaChatRoomId, bravoChatRoomId })
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("LobbyGame")
			.values(
				maps.map((map, index) => ({
					setId: set.id,
					index,
					mode: map.mode,
					stageId: map.stageId,
				})),
			)
			.execute();

		await trx
			.insertInto("LobbySetParticipant")
			.values([
				...alpha.map((userId) => ({
					setId: set.id,
					userId,
					side: "ALPHA" as const,
				})),
				...bravo.map((userId) => ({
					setId: set.id,
					userId,
					side: "BRAVO" as const,
				})),
				...sittingOut.map((userId) => ({ setId: set.id, userId, side: null })),
			])
			.execute();

		return set.id;
	});
}

type ReportResult = "REPORTED" | "STALE" | "NOT_ALLOWED";

/** How a set ends when one of its players leaves, see {@link endLeftSet}. */
export type LeftSetEnding = "CONFIRMED" | "CALLED_OFF" | "FORFEITED";

/**
 * Reports the winner of the set's current map as the actor (`reportedByUserId`). `reportedCount` is how many
 * maps the reporter saw reported, a mismatch means someone else reported in between.
 */
export function reportGame({
	setId,
	winnerSide,
	reportedCount,
}: {
	setId: number;
	winnerSide: LobbySide;
	reportedCount: number;
}): Promise<ReportResult> {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const set = await findSetForUpdate(setId, trx);
		if (!set) return "NOT_ALLOWED";
		if (LobbySet.reportedCount(set) !== reportedCount) return "STALE";
		if (!LobbySet.canReport(set, userId)) return "NOT_ALLOWED";

		const index = LobbySet.currentGameIndex(set);
		if (index === null) return "NOT_ALLOWED";

		await trx
			.updateTable("LobbyGame")
			.set({
				winnerSide,
				reportedAt: databaseTimestampNow(),
				reportedByUserId: userId,
			})
			.where("LobbyGame.setId", "=", setId)
			.where("LobbyGame.index", "=", index)
			.execute();

		return "REPORTED";
	});
}

/** Undoes the latest map report of the set, with its weapon reports and scanner links. Clears a dispute. */
export function undoLatestReport({
	setId,
	reportedCount,
	isHost,
}: {
	setId: number;
	reportedCount: number;
	/** The actor hosts the lobby, undoing for either side */
	isHost: boolean;
}): Promise<ReportResult> {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const set = await findSetForUpdate(setId, trx);
		if (!set) return "NOT_ALLOWED";
		if (LobbySet.reportedCount(set) !== reportedCount) return "STALE";
		if (!LobbySet.canUndo(set, userId, { isHost })) return "NOT_ALLOWED";

		const game = set.games.findLast(
			(candidate) => candidate.winnerSide !== null,
		);
		if (!game) return "NOT_ALLOWED";

		await trx
			.updateTable("LobbyGame")
			.set({ winnerSide: null, reportedAt: null, reportedByUserId: null })
			.where("LobbyGame.id", "=", game.id)
			.execute();
		await trx
			.updateTable("LobbySet")
			.set({ disputedAt: null })
			.where("LobbySet.id", "=", setId)
			.execute();

		await ReportedWeaponRepository.deleteByLobbySetMapIndex(
			{ lobbySetId: setId, mapIndex: game.index },
			trx,
		);
		await ScannerIngestRepository.deleteLinksByLobbyGameId(game.id, trx);

		return "REPORTED";
	});
}

/** Confirms the decided result as the actor (`confirmedByUserId`), of the side asked to confirm. */
export function confirmSet(setId: number): Promise<ReportResult> {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const set = await findSetForUpdate(setId, trx);
		if (set && LobbySet.status(set) === "CONFIRMED") return "STALE";
		if (!set || !LobbySet.canConfirm(set, userId)) return "NOT_ALLOWED";

		await trx
			.updateTable("LobbySet")
			.set({ confirmedAt: databaseTimestampNow(), confirmedByUserId: userId })
			.where("LobbySet.id", "=", setId)
			.execute();

		return "REPORTED";
	});
}

/** Confirms a disputed result as the actor (`confirmedByUserId`), the host settling the dispute. */
export function confirmDisputedSet(setId: number): Promise<ReportResult> {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const set = await findSetForUpdate(setId, trx);
		if (set && LobbySet.status(set) === "CONFIRMED") return "STALE";
		if (!set || LobbySet.status(set) !== "DISPUTED") return "NOT_ALLOWED";

		await trx
			.updateTable("LobbySet")
			.set({ confirmedAt: databaseTimestampNow(), confirmedByUserId: userId })
			.where("LobbySet.id", "=", setId)
			.execute();

		return "REPORTED";
	});
}

/** Marks the decided result disputed by the actor's side. */
export function disputeSet(setId: number): Promise<ReportResult> {
	const userId = actorId();

	return db.transaction().execute(async (trx) => {
		const set = await findSetForUpdate(setId, trx);
		if (set && LobbySet.status(set) === "DISPUTED") return "STALE";
		if (!set || !LobbySet.canDispute(set, userId)) return "NOT_ALLOWED";

		await trx
			.updateTable("LobbySet")
			.set({ disputedAt: databaseTimestampNow() })
			.where("LobbySet.id", "=", setId)
			.execute();

		return "REPORTED";
	});
}

/**
 * Ends the user's unfinished set because they left: a decided result stands as if confirmed, a set without a
 * map reported is called off (deleted), otherwise their side forfeits. Returns how the set ended, `null` if they
 * weren't playing an unfinished set.
 */
export async function endLeftSet(
	{ setId, userId }: { setId: number; userId: number },
	trx?: Transaction<DB>,
): Promise<LeftSetEnding | null> {
	const executor = trx ?? db;
	const set = await findSetForUpdate(setId, executor);
	if (!set || LobbySet.isFinished(set)) return null;

	const side = LobbySet.sideOf(set, userId);
	if (!side) return null;

	if (LobbySet.reportedCount(set) === 0) {
		await executor
			.deleteFrom("LobbySet")
			.where("LobbySet.id", "=", setId)
			.execute();
		return "CALLED_OFF";
	}

	const isDecided = LobbySet.winnerSide(set) !== null;
	await executor
		.updateTable("LobbySet")
		.set(
			isDecided
				? { confirmedAt: databaseTimestampNow() }
				: { forfeitingSide: side },
		)
		.where("LobbySet.id", "=", setId)
		.execute();

	return isDecided ? "CONFIRMED" : "FORFEITED";
}

/** Starts a ready check filling the room's vacant slots from the waitlist (`userIds`). */
export function insertReadyCheck({
	lobbyId,
	expiresAt,
	userIds,
}: {
	lobbyId: number;
	expiresAt: number;
	userIds: number[];
}) {
	return db.transaction().execute(async (trx) => {
		const check = await trx
			.insertInto("LobbyReadyCheck")
			.values({ lobbyId, expiresAt })
			.returning("id")
			.executeTakeFirstOrThrow();

		if (userIds.length > 0) {
			await trx
				.insertInto("LobbyReadyCheckUser")
				.values(
					userIds.map((userId) => ({
						readyCheckId: check.id,
						userId,
						confirmedAt: null,
					})),
				)
				.execute();
		}

		return check.id;
	});
}

/**
 * The user confirms being ready for the lobby's open ready checks, invited or not (anyone waiting may claim a
 * vacant slot). Returns whether any was confirmed.
 */
export async function confirmReadyChecks({
	lobbyId,
	userId,
}: {
	lobbyId: number;
	userId: number;
}) {
	const now = databaseTimestampNow();

	return db.transaction().execute(async (trx) => {
		const checks = await trx
			.selectFrom("LobbyReadyCheck")
			.select("LobbyReadyCheck.id")
			.where("LobbyReadyCheck.lobbyId", "=", lobbyId)
			.execute();

		let confirmedCount = 0n;
		for (const check of checks) {
			const result = await trx
				.insertInto("LobbyReadyCheckUser")
				.values({ readyCheckId: check.id, userId, confirmedAt: now })
				.onConflict((oc) =>
					oc
						.columns(["readyCheckId", "userId"])
						.doUpdateSet({ confirmedAt: now })
						.where("LobbyReadyCheckUser.confirmedAt", "is", null),
				)
				.executeTakeFirst();
			confirmedCount += result.numInsertedOrUpdatedRows ?? 0n;
		}

		return confirmedCount > 0n;
	});
}

/** Deletes the ready check, as when the room's open slots have been filled. */
export async function deleteReadyCheck(readyCheckId: number) {
	await db
		.deleteFrom("LobbyReadyCheck")
		.where("LobbyReadyCheck.id", "=", readyCheckId)
		.execute();
}

async function findSetForUpdate(
	setId: number,
	executor: Transaction<DB> | typeof db,
) {
	const set = await executor
		.selectFrom("LobbySet")
		.select((eb) => [
			"LobbySet.id",
			"LobbySet.bestOf",
			"LobbySet.forfeitingSide",
			"LobbySet.disputedAt",
			"LobbySet.confirmedAt",
			jsonArrayFrom(
				eb
					.selectFrom("LobbyGame")
					.select([
						"LobbyGame.id",
						"LobbyGame.index",
						"LobbyGame.winnerSide",
						"LobbyGame.reportedByUserId",
					])
					.whereRef("LobbyGame.setId", "=", "LobbySet.id")
					.orderBy("LobbyGame.index", "asc"),
			).as("games"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbySetParticipant")
					.select(["LobbySetParticipant.userId", "LobbySetParticipant.side"])
					.whereRef("LobbySetParticipant.setId", "=", "LobbySet.id"),
			).as("participants"),
		])
		.where("LobbySet.id", "=", setId)
		.executeTakeFirst();

	return set;
}
