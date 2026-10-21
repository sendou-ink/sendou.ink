import { addHours } from "date-fns";
import type { ExpressionBuilder, NotNull, Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { AssociationVisibility } from "~/features/associations/associations-types";
import * as Visibility from "~/features/associations/core/Visibility";
import { actorIdOrNull } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { databaseTimestampNow, databaseTimestampToDate } from "~/utils/dates";
import {
	commonUserSelect,
	isPublicNow,
	jsonArrayFrom,
	matchProfileWeapons,
	visibleTo,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import type { Unwrapped } from "~/utils/types";
import * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import {
	CHAT_ROOM_LIFESPAN_HOURS,
	CHECK_IN_LEAD_MINUTES,
	type LobbyParticipantStatus,
} from "./lobbies-constants";

const INDEX_LIST_LIMIT = 50;

export type LobbyById = NonNullable<Unwrapped<typeof findById>>;

/**
 * The lobby with its participants, if the actor may see it: by its visibility, or as a participant or player of
 * one of its sets.
 * `permissions.MANAGE` is the host.
 */
export async function findById(id: number) {
	const viewerId = actorIdOrNull();
	const now = databaseTimestampNow();

	const row = await db
		.selectFrom("Lobby")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			"Lobby.label",
			"Lobby.startsAt",
			"Lobby.bestOf",
			"Lobby.modes",
			"Lobby.roomSize",
			"Lobby.chatRoomId",
			"Lobby.alphaChatRoomId",
			"Lobby.bravoChatRoomId",
			"Lobby.hostUserId",
			"Lobby.pendingSince",
			"Lobby.endedAt",
			"Lobby.createdAt",
			eb.not(isPublicNow({ entity: "Lobby", now })).as("isPrivate"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbyParticipant")
					.innerJoin("User", "User.id", "LobbyParticipant.userId")
					.select((innerEb) => [
						...commonUserSelect(innerEb),
						"User.inGameName",
						"LobbyParticipant.status",
						"LobbyParticipant.joinedAt",
						"LobbyParticipant.isDroppingAfterSet",
						"LobbyParticipant.isSittingOut",
						matchProfileWeapons(innerEb).as("weapons"),
					])
					.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
					.orderBy("LobbyParticipant.joinedAt", "asc")
					.orderBy("LobbyParticipant.id", "asc"),
			).as("participants"),
		])
		.where("Lobby.id", "=", id)
		.where((eb) =>
			viewerId === null
				? visibleTo({ entity: "Lobby", viewerId, now })
				: eb.or([
						visibleTo({ entity: "Lobby", viewerId, now }),
						playedIn(eb, viewerId),
					]),
		)
		.executeTakeFirst();

	if (!row) return;

	return {
		...row,
		isPrivate: Boolean(row.isPrivate),
		participants: row.participants.map((participant) => ({
			...participant,
			isDroppingAfterSet: Boolean(participant.isDroppingAfterSet),
			isSittingOut: Boolean(participant.isSittingOut),
			weaponPool: participant.weapons.map((weapon) => weapon.weaponSplId),
		})),
		permissions: {
			MANAGE: row.endedAt === null ? [row.hostUserId] : [],
		},
	};
}

/** Which of the lobbies the user may see, by visibility or as a participant. */
export async function findAllVisibleIds({
	userId,
	lobbyIds,
}: {
	userId: number;
	lobbyIds: number[];
}) {
	if (lobbyIds.length === 0) return [];

	const now = databaseTimestampNow();
	const rows = await db
		.selectFrom("Lobby")
		.select("Lobby.id")
		.where("Lobby.id", "in", lobbyIds)
		.where((eb) =>
			eb.or([
				visibleTo({ entity: "Lobby", viewerId: userId, now }),
				eb.exists(
					eb
						.selectFrom("LobbyParticipant")
						.select("LobbyParticipant.id")
						.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
						.where("LobbyParticipant.userId", "=", userId),
				),
			]),
		)
		.execute();

	return rows.map((row) => row.id);
}

/** The lobby's own columns and participants, for deciding its next transition. No visibility scoping. */
export async function findProgressionStateById(id: number) {
	return db
		.selectFrom("Lobby")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			"Lobby.hostUserId",
			"Lobby.startsAt",
			"Lobby.bestOf",
			"Lobby.modes",
			"Lobby.roomSize",
			"Lobby.pendingSince",
			"Lobby.endedAt",
			jsonArrayFrom(
				eb
					.selectFrom("LobbyParticipant")
					.select([
						"LobbyParticipant.userId",
						"LobbyParticipant.status",
						"LobbyParticipant.joinedAt",
						"LobbyParticipant.isDroppingAfterSet",
						"LobbyParticipant.isSittingOut",
					])
					.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
					.orderBy("LobbyParticipant.joinedAt", "asc")
					.orderBy("LobbyParticipant.id", "asc"),
			).as("participants"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbyReadyCheck")
					.select((innerEb) => [
						"LobbyReadyCheck.id",
						"LobbyReadyCheck.expiresAt",
						jsonArrayFrom(
							innerEb
								.selectFrom("LobbyReadyCheckUser")
								.select([
									"LobbyReadyCheckUser.userId",
									"LobbyReadyCheckUser.confirmedAt",
								])
								.whereRef(
									"LobbyReadyCheckUser.readyCheckId",
									"=",
									"LobbyReadyCheck.id",
								),
						).as("users"),
					])
					.whereRef("LobbyReadyCheck.lobbyId", "=", "Lobby.id")
					.orderBy("LobbyReadyCheck.id", "asc"),
			).as("readyChecks"),
		])
		.where("Lobby.id", "=", id)
		.executeTakeFirst();
}

/** The lobbies owning the common chat rooms, for resolving who is in them. */
export async function findAllByChatRoomIds(chatRoomIds: number[]) {
	if (chatRoomIds.length === 0) return [];

	return db
		.selectFrom("Lobby")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			"Lobby.chatRoomId",
			"Lobby.endedAt",
			jsonArrayFrom(
				eb
					.selectFrom("LobbyParticipant")
					.select("LobbyParticipant.userId")
					.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id"),
			).as("participants"),
		])
		.where("Lobby.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

const listColumns = [
	"Lobby.id",
	"Lobby.name",
	"Lobby.label",
	"Lobby.startsAt",
	"Lobby.roomSize",
	"Lobby.endedAt",
] as const;

function listQuery({
	viewerId,
	now,
}: {
	viewerId: number | null;
	now: number;
}) {
	return db
		.selectFrom("Lobby")
		.innerJoin("User", "User.id", "Lobby.hostUserId")
		.select((eb) => [
			...listColumns,
			...commonUserSelect(eb, { prefix: "host" }),
			eb.not(isPublicNow({ entity: "Lobby", now })).as("isPrivate"),
			eb
				.selectFrom("LobbyParticipant")
				.select((innerEb) => innerEb.fn.countAll<number>().as("count"))
				.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
				.where("LobbyParticipant.status", "!=", "WAITLISTED")
				.as("playerCount"),
			viewerId === null
				? sql<LobbyParticipantStatus | null>`null`.as("viewerStatus")
				: eb
						.selectFrom("LobbyParticipant")
						.select("LobbyParticipant.status")
						.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
						.where("LobbyParticipant.userId", "=", viewerId)
						.as("viewerStatus"),
		]);
}

/**
 * Lobbies for the index page: running and upcoming ones visible to the actor, with the actor's own (participating)
 * lobbies first, and ended ones the actor played in.
 */
export async function findAllForIndex() {
	const viewerId = actorIdOrNull();
	const now = databaseTimestampNow();
	const visible = visibleTo({ entity: "Lobby", viewerId, now });
	const mapRow = (row: Unwrapped<ReturnType<typeof listQuery>["execute"]>) => ({
		...row,
		isPrivate: Boolean(row.isPrivate),
		playerCount: row.playerCount ?? 0,
	});

	const [own, running, upcoming, ended] = await Promise.all([
		viewerId === null
			? []
			: listQuery({ viewerId, now })
					.where("Lobby.endedAt", "is", null)
					.where("Lobby.id", "in", (eb) =>
						eb
							.selectFrom("LobbyParticipant")
							.select("LobbyParticipant.lobbyId")
							.where("LobbyParticipant.userId", "=", viewerId),
					)
					.orderBy("Lobby.startsAt", "asc")
					.limit(INDEX_LIST_LIMIT)
					.execute(),
		listQuery({ viewerId, now })
			.where("Lobby.endedAt", "is", null)
			.where("Lobby.startsAt", "<=", now)
			.where(visible)
			.orderBy("Lobby.startsAt", "desc")
			.limit(INDEX_LIST_LIMIT)
			.execute(),
		listQuery({ viewerId, now })
			.where("Lobby.endedAt", "is", null)
			.where("Lobby.startsAt", ">", now)
			.where(visible)
			.orderBy("Lobby.startsAt", "asc")
			.limit(INDEX_LIST_LIMIT)
			.execute(),
		// TODO: paginate, only the latest INDEX_LIST_LIMIT ended lobbies are listed
		viewerId === null
			? []
			: listQuery({ viewerId, now })
					.where("Lobby.endedAt", "is not", null)
					.where((eb) => playedIn(eb, viewerId))
					.orderBy("Lobby.endedAt", "desc")
					.limit(INDEX_LIST_LIMIT)
					.execute(),
	]);

	const ownIds = new Set(own.map((row) => row.id));
	const notOwn = (row: { id: number }) => !ownIds.has(row.id);
	const hasStarted = (row: { startsAt: number }) => row.startsAt <= now;

	return {
		running: [...own.filter(hasStarted), ...running.filter(notOwn)].map(mapRow),
		upcoming: [
			...own.filter((row) => !hasStarted(row)),
			...upcoming.filter(notOwn),
		].map(mapRow),
		ended: ended.map(mapRow),
	};
}

/** Lobbies the user is signed up for (or hosting) that haven't ended and start within the window. */
export function findAllUpcomingByUserId({
	userId,
	startsBefore,
}: {
	userId: number;
	startsBefore: number;
}) {
	return db
		.selectFrom("LobbyParticipant")
		.innerJoin("Lobby", "Lobby.id", "LobbyParticipant.lobbyId")
		.select(["Lobby.id", "Lobby.name", "Lobby.startsAt"])
		.where("LobbyParticipant.userId", "=", userId)
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.startsAt", "<=", startsBefore)
		.orderBy("Lobby.startsAt", "asc")
		.limit(INDEX_LIST_LIMIT)
		.execute();
}

/** Who is active in a lobby (present: checked in or in the room, not dropping) and in which, across unended lobbies. */
export function findAllActiveParticipants() {
	return db
		.selectFrom("LobbyParticipant")
		.innerJoin("Lobby", "Lobby.id", "LobbyParticipant.lobbyId")
		.select([
			"LobbyParticipant.userId",
			"LobbyParticipant.status",
			"Lobby.id as lobbyId",
			"Lobby.name as lobbyName",
		])
		.where("Lobby.endedAt", "is", null)
		.where("LobbyParticipant.status", "in", ["CHECKED_IN", "IN_ROOM"])
		.where("LobbyParticipant.isDroppingAfterSet", "=", 0)
		.execute();
}

/**
 * Upcoming lobbies the viewer's friends signed up for that the viewer may see and hasn't signed up for, as
 * invitations to join. One row per friend per lobby.
 */
export function findAllUpcomingOfFriendsByUserId(viewerId: number) {
	const now = databaseTimestampNow();

	return db
		.selectFrom("Friendship")
		.innerJoin("LobbyParticipant", (join) =>
			join.on((eb) =>
				eb.or([
					eb.and([
						eb("Friendship.userOneId", "=", viewerId),
						eb("LobbyParticipant.userId", "=", eb.ref("Friendship.userTwoId")),
					]),
					eb.and([
						eb("Friendship.userTwoId", "=", viewerId),
						eb("LobbyParticipant.userId", "=", eb.ref("Friendship.userOneId")),
					]),
				]),
			),
		)
		.innerJoin("Lobby", "Lobby.id", "LobbyParticipant.lobbyId")
		.select([
			"LobbyParticipant.userId as friendId",
			"Lobby.id as lobbyId",
			"Lobby.name as lobbyName",
			"Lobby.startsAt",
			"Lobby.roomSize",
			(eb) =>
				eb
					.selectFrom("LobbyParticipant as Spot")
					.select((innerEb) => innerEb.fn.countAll<number>().as("count"))
					.whereRef("Spot.lobbyId", "=", "Lobby.id")
					.where("Spot.status", "!=", "WAITLISTED")
					.as("participantCount"),
		])
		.where((eb) =>
			eb.or([
				eb("Friendship.userOneId", "=", viewerId),
				eb("Friendship.userTwoId", "=", viewerId),
			]),
		)
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.startsAt", ">", now)
		.where(visibleTo({ entity: "Lobby", viewerId, now }))
		.where((eb) =>
			eb.not(
				eb.exists(
					eb
						.selectFrom("LobbyParticipant as Own")
						.select("Own.id")
						.whereRef("Own.lobbyId", "=", "Lobby.id")
						.where("Own.userId", "=", viewerId),
				),
			),
		)
		.execute();
}

/** Unended lobbies whose check-in has opened but whose participants haven't been told yet. */
export function findAllWithCheckInOpenedUnnotified() {
	const now = databaseTimestampNow();

	return db
		.selectFrom("Lobby")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			jsonArrayFrom(
				eb
					.selectFrom("LobbyParticipant")
					.select("LobbyParticipant.userId")
					.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
					.where("LobbyParticipant.status", "=", "REGISTERED"),
			).as("participants"),
		])
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.checkInNotifiedAt", "is", null)
		.where("Lobby.startsAt", "<=", now + CHECK_IN_LEAD_MINUTES * 60)
		.execute();
}

/** Ids of unended lobbies whose check-in has opened, i.e. that may have something due. */
export async function findAllUnendedIdsCheckInOpened() {
	const now = databaseTimestampNow();

	const rows = await db
		.selectFrom("Lobby")
		.select("Lobby.id")
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.startsAt", "<=", now + CHECK_IN_LEAD_MINUTES * 60)
		.execute();

	return rows.map((row) => row.id);
}

type InsertArgs = Omit<
	TablesInsertable["Lobby"],
	"chatRoomId" | "alphaChatRoomId" | "bravoChatRoomId" | "modes"
> & {
	modes: Tables["Lobby"]["modes"];
	visibility: AssociationVisibility | null;
	/** `CHECKED_IN` when the lobby is made with check-in already open, the host being present */
	hostStatus?: Extract<LobbyParticipantStatus, "REGISTERED" | "CHECKED_IN">;
};

/** Inserts the lobby with its chat rooms and visibility, the host as its first participant. Returns the id. */
export function insert({
	visibility,
	modes,
	hostStatus = "REGISTERED",
	...args
}: InsertArgs) {
	return db.transaction().execute(async (trx) => {
		const expiresAt = addHours(
			databaseTimestampToDate(args.startsAt),
			CHAT_ROOM_LIFESPAN_HOURS,
		);
		const chatRoom = await ChatRepository.insertRoom(
			{ type: "LOBBY", expiresAt },
			trx,
		);
		const [alphaChatRoomId, bravoChatRoomId] = await ChatRepository.insertRooms(
			{ type: "LOBBY_TEAM", expiresAt, count: 2 },
			trx,
		);

		const lobby = await trx
			.insertInto("Lobby")
			.values({
				...args,
				modes: JSON.stringify(modes),
				chatRoomId: chatRoom.id,
				alphaChatRoomId,
				bravoChatRoomId,
			})
			.returning(["id", "createdAt"])
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ContentVisibility")
			.values(
				Visibility.toRows(visibility, {
					createdAt: lobby.createdAt,
					ownerId: args.hostUserId,
				}).map((row) => ({ ...row, lobbyId: lobby.id })),
			)
			.execute();

		await trx
			.insertInto("LobbyParticipant")
			.values({
				lobbyId: lobby.id,
				userId: args.hostUserId,
				status: hostStatus,
			})
			.execute();

		return lobby.id;
	});
}

/** Signs the user up. Signing up again after leaving starts from the end of the queue. */
export async function insertParticipant(
	args: Pick<
		TablesInsertable["LobbyParticipant"],
		"lobbyId" | "userId" | "status"
	>,
) {
	await db
		.insertInto("LobbyParticipant")
		.values(args)
		.onConflict((oc) => oc.columns(["lobbyId", "userId"]).doNothing())
		.execute();
}

/** Updates a participant's own columns. */
export async function updateParticipant(
	{
		lobbyId,
		userId,
		...values
	}: {
		lobbyId: number;
		userId: number;
		status?: LobbyParticipantStatus;
		isDroppingAfterSet?: boolean;
		isSittingOut?: boolean;
	},
	trx?: Transaction<DB>,
) {
	await (trx ?? db)
		.updateTable("LobbyParticipant")
		.set({
			status: values.status,
			isDroppingAfterSet:
				values.isDroppingAfterSet === undefined
					? undefined
					: toDBBoolean(values.isDroppingAfterSet),
			isSittingOut:
				values.isSittingOut === undefined
					? undefined
					: toDBBoolean(values.isSittingOut),
		})
		.where("LobbyParticipant.lobbyId", "=", lobbyId)
		.where("LobbyParticipant.userId", "=", userId)
		.execute();
}

/** Sets the participants' status. */
export async function updateParticipantsStatus({
	lobbyId,
	userIds,
	status,
}: {
	lobbyId: number;
	userIds: number[];
	status: LobbyParticipantStatus;
}) {
	if (userIds.length === 0) return;

	await db
		.updateTable("LobbyParticipant")
		.set({ status })
		.where("LobbyParticipant.lobbyId", "=", lobbyId)
		.where("LobbyParticipant.userId", "in", userIds)
		.execute();
}

/** Removes the users from the lobby and from the lobby's ready checks. */
export async function deleteParticipants(
	{ lobbyId, userIds }: { lobbyId: number; userIds: number[] },
	trx?: Transaction<DB>,
) {
	if (userIds.length === 0) return;

	const executor = trx ?? db;

	await executor
		.deleteFrom("LobbyParticipant")
		.where("LobbyParticipant.lobbyId", "=", lobbyId)
		.where("LobbyParticipant.userId", "in", userIds)
		.execute();
	await executor
		.deleteFrom("LobbyReadyCheckUser")
		.where("LobbyReadyCheckUser.userId", "in", userIds)
		.where("LobbyReadyCheckUser.readyCheckId", "in", (eb) =>
			eb
				.selectFrom("LobbyReadyCheck")
				.select("LobbyReadyCheck.id")
				.where("LobbyReadyCheck.lobbyId", "=", lobbyId),
		)
		.execute();
}

/**
 * Removes the user from the lobby right away. If they are playing an unfinished set (`unfinishedSetId`) it ends:
 * a decided result stands, otherwise their side forfeits.
 */
export function removeParticipant({
	lobbyId,
	userId,
	unfinishedSetId,
}: {
	lobbyId: number;
	userId: number;
	unfinishedSetId: number | null;
}) {
	return db.transaction().execute(async (trx) => {
		if (unfinishedSetId !== null) {
			await LobbyMatchRepository.forfeitOrConfirmLeftSet(
				{ setId: unfinishedSetId, userId },
				trx,
			);
		}

		await deleteParticipants({ lobbyId, userIds: [userId] }, trx);
	});
}

/** Updates the settings the host can change after creating the lobby. */
export async function updateSettings({
	id,
	bestOf,
	modes,
}: Pick<Tables["Lobby"], "id" | "bestOf" | "modes">) {
	await db
		.updateTable("Lobby")
		.set({
			bestOf,
			modes: JSON.stringify(modes),
		})
		.where("Lobby.id", "=", id)
		.execute();
}

/** Updates the lobby's own bookkeeping columns. */
export async function update(
	{
		id,
		...values
	}: {
		id: number;
		hostUserId?: number;
		pendingSince?: number | null;
		checkInNotifiedAt?: number;
	},
	trx?: Transaction<DB>,
) {
	await (trx ?? db)
		.updateTable("Lobby")
		.set(values)
		.where("Lobby.id", "=", id)
		.execute();
}

/**
 * Ends the lobby. Its chat rooms become inactive, nobody counts as active in it anymore and sets that hadn't
 * got a single map reported are dropped.
 */
export function end(id: number) {
	return db.transaction().execute(async (trx) => {
		await trx
			.updateTable("Lobby")
			.set({ endedAt: databaseTimestampNow() })
			.where("Lobby.id", "=", id)
			.where("Lobby.endedAt", "is", null)
			.execute();

		const lobby = await trx
			.selectFrom("Lobby")
			.select([
				"Lobby.chatRoomId",
				"Lobby.alphaChatRoomId",
				"Lobby.bravoChatRoomId",
			])
			.where("Lobby.id", "=", id)
			.executeTakeFirstOrThrow();

		await ChatRepository.updateRoomsInactive(
			[lobby.chatRoomId, lobby.alphaChatRoomId, lobby.bravoChatRoomId],
			true,
			trx,
		);

		await trx
			.deleteFrom("LobbyReadyCheck")
			.where("LobbyReadyCheck.lobbyId", "=", id)
			.execute();

		await trx
			.deleteFrom("LobbySet")
			.where("LobbySet.lobbyId", "=", id)
			.where("LobbySet.confirmedAt", "is", null)
			.where("LobbySet.forfeitingSide", "is", null)
			.where((eb) =>
				eb.not(
					eb.exists(
						eb
							.selectFrom("LobbyGame")
							.select("LobbyGame.id")
							.whereRef("LobbyGame.setId", "=", "LobbySet.id")
							.where("LobbyGame.winnerSide", "is not", null),
					),
				),
			)
			.execute();
	});
}

function playedIn(eb: ExpressionBuilder<DB, "Lobby">, userId: number) {
	return eb.or([
		eb.exists(
			eb
				.selectFrom("LobbyParticipant")
				.select("LobbyParticipant.id")
				.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
				.where("LobbyParticipant.userId", "=", userId),
		),
		eb.exists(
			eb
				.selectFrom("LobbySetParticipant")
				.innerJoin("LobbySet", "LobbySet.id", "LobbySetParticipant.setId")
				.select("LobbySetParticipant.setId")
				.whereRef("LobbySet.lobbyId", "=", "Lobby.id")
				.where("LobbySetParticipant.userId", "=", userId),
		),
	]);
}
