import type { ExpressionBuilder, NotNull, Transaction } from "kysely";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables, TablesInsertable } from "~/db/tables";
import type { AssociationVisibility } from "~/features/associations/associations-types";
import * as Visibility from "~/features/associations/core/Visibility";
import { actorIdOrNull } from "~/features/auth/core/user.server";
import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { shortNanoid } from "~/utils/id";
import {
	commonUserSelect,
	isPublicNow,
	jsonArrayFrom,
	matchProfileWeapons,
	visibleTo,
} from "~/utils/kysely.server";
import { toDBBoolean } from "~/utils/sql";
import type { Unwrapped } from "~/utils/types";
import * as Leaderboard from "./core/Leaderboard";
import * as LobbyMatchRepository from "./LobbyMatchRepository.server";
import {
	CHECK_IN_LEAD_MINUTES,
	type LobbyApplicationState,
	type LobbyParticipantStatus,
} from "./lobbies-constants";
import { lobbyChatRoomExpiresAt } from "./lobbies-utils";

const INDEX_LIST_LIMIT = 50;

interface ParticipantRemoval {
	lobbyId: number;
	userId: number;
	unfinishedSetId: number | null;
}

/** The lobby with its participants, see {@link findById}. */
export type LobbyById = NonNullable<Unwrapped<typeof findById>>;

/**
 * The lobby with its participants, if the actor may see it: by its visibility, its share key, or as a participant
 * or player of one of its sets or one who left it. `leftUsers` are those who left it after playing a set and haven't
 * signed up again, they keep its chat until kicked. `isViewerKicked` is whether the host kicked the actor out of it,
 * `hasViewerLeft` whether the actor left it at some point and so keeps its chat. While the lobby requires applying,
 * `viewerApplication` is the state of the actor's application to it and `applications` the pending ones, for the host.
 * `permissions.MANAGE` is the host. `shareKey` goes to the host and, as everyone in a link-only lobby already
 * reached it through the link, to every viewer of one.
 */
export async function findById(
	id: number,
	{ shareKey = null }: { shareKey?: string | null } = {},
) {
	const viewerId = actorIdOrNull();
	const now = databaseTimestampNow();

	const row = await db
		.selectFrom("Lobby")
		.innerJoin("User as Host", "Host.id", "Lobby.hostUserId")
		.select((eb) => [
			"Lobby.id",
			"Lobby.name",
			"Lobby.description",
			"Lobby.label",
			"Lobby.startsAt",
			"Lobby.bestOf",
			"Lobby.modes",
			"Lobby.mapPool",
			"Lobby.mapsTournamentId",
			mapsTournamentName(eb).as("mapsTournamentName"),
			"Lobby.roomSize",
			"Lobby.weaponRandomizer",
			"Lobby.isApplicationRequired",
			"Lobby.chatRoomId",
			"Lobby.hostUserId",
			"Lobby.pendingSince",
			"Lobby.endedAt",
			"Lobby.checkInOpenedAt",
			"Lobby.shareKey",
			"Lobby.createdAt",
			"Host.username as hostUsername",
			eb.not(isPublicNow({ entity: "Lobby", now })).as("isPrivate"),
			isLinkOnly(eb).as("isLinkOnly"),
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
			jsonArrayFrom(
				eb
					.selectFrom("LobbyLeftUser")
					.innerJoin("User", "User.id", "LobbyLeftUser.userId")
					.select((innerEb) => commonUserSelect(innerEb))
					.whereRef("LobbyLeftUser.lobbyId", "=", "Lobby.id")
					.where((innerEb) =>
						innerEb.not(
							innerEb.exists(
								innerEb
									.selectFrom("LobbyParticipant")
									.select("LobbyParticipant.userId")
									.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
									.whereRef(
										"LobbyParticipant.userId",
										"=",
										"LobbyLeftUser.userId",
									),
							),
						),
					)
					.orderBy("LobbyLeftUser.createdAt", "asc"),
			).as("leftUsers"),
			jsonArrayFrom(
				eb
					.selectFrom("LobbyApplication")
					.innerJoin("User", "User.id", "LobbyApplication.userId")
					.select((innerEb) => [
						...commonUserSelect(innerEb),
						"LobbyApplication.createdAt",
						matchProfileWeapons(innerEb).as("weapons"),
					])
					.whereRef("LobbyApplication.lobbyId", "=", "Lobby.id")
					.where("LobbyApplication.deniedAt", "is", null)
					.orderBy("LobbyApplication.createdAt", "asc")
					.orderBy("LobbyApplication.userId", "asc"),
			).as("applications"),
			viewerId === null
				? sql<null>`null`.as("viewerApplication")
				: eb
						.selectFrom("LobbyApplication")
						.select((innerEb) =>
							innerEb
								.case()
								.when("LobbyApplication.deniedAt", "is", null)
								.then(sql.lit("PENDING"))
								.else(sql.lit("DENIED"))
								.end()
								.$castTo<LobbyApplicationState>()
								.as("state"),
						)
						.whereRef("LobbyApplication.lobbyId", "=", "Lobby.id")
						.where("LobbyApplication.userId", "=", viewerId)
						.as("viewerApplication"),
			viewerId === null
				? sql<number>`0`.as("isViewerKicked")
				: eb
						.exists(
							eb
								.selectFrom("LobbyKickedUser")
								.select("LobbyKickedUser.userId")
								.whereRef("LobbyKickedUser.lobbyId", "=", "Lobby.id")
								.where("LobbyKickedUser.userId", "=", viewerId),
						)
						.as("isViewerKicked"),
			viewerId === null
				? sql<number>`0`.as("hasViewerLeft")
				: eb
						.exists(
							eb
								.selectFrom("LobbyLeftUser")
								.select("LobbyLeftUser.userId")
								.whereRef("LobbyLeftUser.lobbyId", "=", "Lobby.id")
								.where("LobbyLeftUser.userId", "=", viewerId),
						)
						.as("hasViewerLeft"),
		])
		.where("Lobby.id", "=", id)
		.where((eb) =>
			eb.or([
				visibleTo({ entity: "Lobby", viewerId, now }),
				...(shareKey === null ? [] : [eb("Lobby.shareKey", "=", shareKey)]),
				...(viewerId === null ? [] : [participatedIn(eb, viewerId)]),
			]),
		)
		.executeTakeFirst();

	if (!row) return;

	const isLinkOnlyLobby = Boolean(row.isLinkOnly);
	const isApplicationRequired = Boolean(row.isApplicationRequired);

	return {
		...row,
		shareKey:
			isLinkOnlyLobby || row.hostUserId === viewerId ? row.shareKey : null,
		isPrivate: Boolean(row.isPrivate),
		isLinkOnly: isLinkOnlyLobby,
		isApplicationRequired,
		isViewerKicked: Boolean(row.isViewerKicked),
		hasViewerLeft: Boolean(row.hasViewerLeft),
		viewerApplication: isApplicationRequired
			? (row.viewerApplication ?? null)
			: null,
		applications:
			isApplicationRequired &&
			row.endedAt === null &&
			row.hostUserId === viewerId
				? row.applications.map((application) => ({
						...application,
						weaponPool: application.weapons.map((weapon) => weapon.weaponSplId),
					}))
				: [],
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

/** Whether the lobby exists and is link-only, seen only through its share link by those not participating. No visibility scoping. */
export async function isLinkOnlyById(id: number) {
	const row = await db
		.selectFrom("Lobby")
		.select("Lobby.id")
		.where("Lobby.id", "=", id)
		.where(isLinkOnly)
		.executeTakeFirst();

	return Boolean(row);
}

/** Which of the lobbies the user may see, by visibility or as a participant, and whether a spot in them is free. */
export async function findAllVisible({
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
		.select((eb) => [
			"Lobby.id",
			"Lobby.roomSize",
			eb
				.selectFrom("LobbyParticipant")
				.select((innerEb) => innerEb.fn.countAll<number>().as("count"))
				.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
				.where("LobbyParticipant.status", "!=", "WAITLISTED")
				.as("playerCount"),
			isParticipant(eb, userId).as("isUserParticipant"),
		])
		.where("Lobby.id", "in", lobbyIds)
		.where((eb) =>
			eb.or([
				visibleTo({ entity: "Lobby", viewerId: userId, now }),
				isParticipant(eb, userId),
			]),
		)
		.execute();

	return rows.map((row) => ({
		id: row.id,
		hasOpenSlot: (row.playerCount ?? 0) < row.roomSize,
		isUserParticipant: Boolean(row.isUserParticipant),
	}));
}

function isParticipant(eb: ExpressionBuilder<DB, "Lobby">, userId: number) {
	return eb.exists(
		eb
			.selectFrom("LobbyParticipant")
			.select("LobbyParticipant.id")
			.whereRef("LobbyParticipant.lobbyId", "=", "Lobby.id")
			.where("LobbyParticipant.userId", "=", userId),
	);
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
			"Lobby.mapPool",
			"Lobby.roomSize",
			"Lobby.weaponRandomizer",
			"Lobby.chatRoomId",
			"Lobby.pendingSince",
			"Lobby.endedAt",
			"Lobby.checkInOpenedAt",
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

/** The lobbies owning the common chat rooms, for resolving who is in them: the participants and those who left without being kicked. */
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
			jsonArrayFrom(
				eb
					.selectFrom("LobbyLeftUser")
					.select("LobbyLeftUser.userId")
					.whereRef("LobbyLeftUser.lobbyId", "=", "Lobby.id"),
			).as("leftUsers"),
		])
		.where("Lobby.chatRoomId", "in", chatRoomIds)
		.$narrowType<{ chatRoomId: NotNull }>()
		.execute();
}

const listColumns = [
	"Lobby.id",
	"Lobby.name",
	"Lobby.description",
	"Lobby.label",
	"Lobby.startsAt",
	"Lobby.modes",
	"Lobby.mapPool",
	"Lobby.mapsTournamentId",
	"Lobby.roomSize",
	"Lobby.weaponRandomizer",
	"Lobby.isApplicationRequired",
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
			mapsTournamentName(eb).as("mapsTournamentName"),
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
			viewerId === null
				? sql<number>`0`.as("isViewerPlaying")
				: isPlaying(eb, viewerId).as("isViewerPlaying"),
			viewerId === null
				? sql<number>`0`.as("hasViewerApplied")
				: eb
						.exists(
							eb
								.selectFrom("LobbyApplication")
								.select("LobbyApplication.userId")
								.whereRef("LobbyApplication.lobbyId", "=", "Lobby.id")
								.where("LobbyApplication.userId", "=", viewerId)
								.where("LobbyApplication.deniedAt", "is", null),
						)
						.as("hasViewerApplied"),
		]);
}

/**
 * Whether the user plays in the room rather than spectates: on a side of the latest set, unless sitting out with
 * that set finished.
 */
function isPlaying(eb: ExpressionBuilder<DB, "Lobby">, userId: number) {
	return eb.exists(
		eb
			.selectFrom("LobbySetParticipant")
			.innerJoin("LobbySet", "LobbySet.id", "LobbySetParticipant.setId")
			.innerJoin("LobbyParticipant", (join) =>
				join
					.onRef("LobbyParticipant.lobbyId", "=", "LobbySet.lobbyId")
					.onRef("LobbyParticipant.userId", "=", "LobbySetParticipant.userId"),
			)
			.select("LobbySetParticipant.setId")
			.where("LobbySetParticipant.userId", "=", userId)
			.where("LobbySetParticipant.side", "is not", null)
			.where("LobbySet.id", "=", (innerEb) =>
				innerEb
					.selectFrom("LobbySet as LatestSet")
					.select("LatestSet.id")
					.whereRef("LatestSet.lobbyId", "=", "Lobby.id")
					.orderBy("LatestSet.id", "desc")
					.limit(1),
			)
			.where((innerEb) =>
				innerEb.or([
					innerEb("LobbyParticipant.isSittingOut", "=", 0),
					innerEb.and([
						innerEb("LobbySet.confirmedAt", "is", null),
						innerEb("LobbySet.forfeitingSide", "is", null),
					]),
				]),
			),
	);
}

/**
 * Lobbies for the index page: running and upcoming ones visible to the actor, with the actor's own (participating)
 * lobbies first, and ended ones the actor played in. `viewerStatus` tells apart spectating from playing in the room,
 * `hasViewerApplied` is whether the actor's application to a lobby requiring one is pending.
 */
export async function findAllForIndex() {
	const viewerId = actorIdOrNull();
	const now = databaseTimestampNow();
	const visible = visibleTo({ entity: "Lobby", viewerId, now });
	const mapRow = ({
		isViewerPlaying,
		...row
	}: Unwrapped<ReturnType<typeof listQuery>["execute"]>) => ({
		...row,
		viewerStatus:
			row.viewerStatus === "IN_ROOM" && !isViewerPlaying
				? ("SPECTATING" as const)
				: row.viewerStatus,
		isPrivate: Boolean(row.isPrivate),
		isApplicationRequired: Boolean(row.isApplicationRequired),
		hasViewerApplied:
			Boolean(row.isApplicationRequired) && Boolean(row.hasViewerApplied),
		playerCount: row.playerCount ?? 0,
	});

	const own =
		viewerId === null
			? []
			: await listQuery({ viewerId, now })
					.where("Lobby.endedAt", "is", null)
					.where("Lobby.id", "in", (eb) =>
						eb
							.selectFrom("LobbyParticipant")
							.select("LobbyParticipant.lobbyId")
							.where("LobbyParticipant.userId", "=", viewerId),
					)
					.orderBy("Lobby.startsAt", "asc")
					.limit(INDEX_LIST_LIMIT)
					.execute();
	const running = await listQuery({ viewerId, now })
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.startsAt", "<=", now)
		.where(visible)
		.orderBy("Lobby.startsAt", "desc")
		.limit(INDEX_LIST_LIMIT)
		.execute();
	const upcoming = await listQuery({ viewerId, now })
		.where("Lobby.endedAt", "is", null)
		.where("Lobby.startsAt", ">", now)
		.where(visible)
		.orderBy("Lobby.startsAt", "asc")
		.limit(INDEX_LIST_LIMIT)
		.execute();
	// TODO: paginate, only the latest INDEX_LIST_LIMIT ended lobbies are listed
	const ended =
		viewerId === null
			? []
			: await listQuery({ viewerId, now })
					.where("Lobby.endedAt", "is not", null)
					.where("Lobby.id", "in", (eb) =>
						eb
							.selectFrom("LobbyParticipant")
							.select("LobbyParticipant.lobbyId")
							.where("LobbyParticipant.userId", "=", viewerId)
							.union(
								eb
									.selectFrom("LobbySetParticipant")
									.innerJoin(
										"LobbySet",
										"LobbySet.id",
										"LobbySetParticipant.setId",
									)
									.select("LobbySet.lobbyId")
									.where("LobbySetParticipant.userId", "=", viewerId),
							),
					)
					.orderBy("Lobby.endedAt", "desc")
					.limit(INDEX_LIST_LIMIT)
					.execute();

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

/**
 * Who is active in a lobby (present: checked in or in the room, not dropping) and in which, across unended
 * lobbies. `isPlayingSet` is whether they play a side of the lobby's unfinished set.
 */
export async function findAllActiveParticipants() {
	const rows = await db
		.selectFrom("LobbyParticipant")
		.innerJoin("Lobby", "Lobby.id", "LobbyParticipant.lobbyId")
		.select((eb) => [
			"LobbyParticipant.userId",
			"LobbyParticipant.status",
			"Lobby.id as lobbyId",
			"Lobby.name as lobbyName",
			eb
				.exists(
					eb
						.selectFrom("LobbySetParticipant")
						.innerJoin("LobbySet", "LobbySet.id", "LobbySetParticipant.setId")
						.select("LobbySetParticipant.setId")
						.whereRef("LobbySet.lobbyId", "=", "Lobby.id")
						.where("LobbySet.confirmedAt", "is", null)
						.where("LobbySet.forfeitingSide", "is", null)
						.whereRef(
							"LobbySetParticipant.userId",
							"=",
							"LobbyParticipant.userId",
						)
						.where("LobbySetParticipant.side", "is not", null),
				)
				.as("isPlayingSet"),
		])
		.where("Lobby.endedAt", "is", null)
		.where("LobbyParticipant.status", "in", ["CHECKED_IN", "IN_ROOM"])
		.where("LobbyParticipant.isDroppingAfterSet", "=", 0)
		.execute();

	return rows.map((row) => ({
		...row,
		isPlayingSet: Boolean(row.isPlayingSet),
	}));
}

/** Who a lobby's open ready check is waiting on: asked to take a vacant spot in its room and not confirmed yet. */
export function findAllUnconfirmedReadyCheckUsers() {
	return db
		.selectFrom("LobbyReadyCheckUser")
		.innerJoin(
			"LobbyReadyCheck",
			"LobbyReadyCheck.id",
			"LobbyReadyCheckUser.readyCheckId",
		)
		.innerJoin("LobbyParticipant", (join) =>
			join
				.onRef("LobbyParticipant.lobbyId", "=", "LobbyReadyCheck.lobbyId")
				.onRef("LobbyParticipant.userId", "=", "LobbyReadyCheckUser.userId"),
		)
		.select(["LobbyReadyCheckUser.userId", "LobbyReadyCheck.lobbyId"])
		.where("LobbyReadyCheckUser.confirmedAt", "is", null)
		.where("LobbyParticipant.status", "!=", "IN_ROOM")
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

/** Ids of unended lobbies starting in at most the check-in lead time or started, i.e. that may have something due. */
export async function findAllUnendedIdsNearStart() {
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
	"chatRoomId" | "modes" | "mapPool" | "shareKey" | "isApplicationRequired"
> & {
	modes: Tables["Lobby"]["modes"];
	mapPool: Tables["Lobby"]["mapPool"];
	isApplicationRequired?: boolean;
	/** `LINK_ONLY` = seen only through the share link, by those not participating */
	visibility: AssociationVisibility | "LINK_ONLY" | null;
};

/** Inserts the lobby with its chat room and visibility, the host as its first participant. Returns the id. */
export function insert({
	visibility,
	modes,
	mapPool,
	isApplicationRequired = false,
	...args
}: InsertArgs) {
	return db.transaction().execute(async (trx) => {
		const chatRoom = await ChatRepository.insertRoom(
			{ type: "LOBBY", expiresAt: lobbyChatRoomExpiresAt(args.startsAt) },
			trx,
		);

		const lobby = await trx
			.insertInto("Lobby")
			.values({
				...args,
				modes: JSON.stringify(modes),
				mapPool: mapPool ? JSON.stringify(mapPool) : null,
				isApplicationRequired: toDBBoolean(isApplicationRequired),
				chatRoomId: chatRoom.id,
				shareKey: shortNanoid(),
			})
			.returning(["id", "createdAt"])
			.executeTakeFirstOrThrow();

		if (visibility !== "LINK_ONLY") {
			await trx
				.insertInto("ContentVisibility")
				.values(
					Visibility.toRows(visibility, {
						createdAt: lobby.createdAt,
						ownerId: args.hostUserId,
					}).map((row) => ({ ...row, lobbyId: lobby.id })),
				)
				.execute();
		}

		await trx
			.insertInto("LobbyParticipant")
			.values({
				lobbyId: lobby.id,
				userId: args.hostUserId,
				status: "REGISTERED",
			})
			.execute();

		return lobby.id;
	});
}

/** Signs the user up, their application to the lobby (if any) done with. Signing up again after leaving starts from the end of the queue. */
export function insertParticipant(
	args: Pick<
		TablesInsertable["LobbyParticipant"],
		"lobbyId" | "userId" | "status"
	>,
) {
	return db.transaction().execute(async (trx) => {
		await trx
			.insertInto("LobbyParticipant")
			.values(args)
			.onConflict((oc) => oc.columns(["lobbyId", "userId"]).doNothing())
			.execute();
		await trx
			.deleteFrom("LobbyApplication")
			.where("LobbyApplication.lobbyId", "=", args.lobbyId)
			.where("LobbyApplication.userId", "=", args.userId)
			.execute();
	});
}

/** Applies to join the lobby, pending until the host approves or denies it. */
export async function insertApplication({
	lobbyId,
	userId,
}: {
	lobbyId: number;
	userId: number;
}) {
	await db
		.insertInto("LobbyApplication")
		.values({ lobbyId, userId })
		.onConflict((oc) => oc.columns(["lobbyId", "userId"]).doNothing())
		.execute();
}

/** Withdraws the user's pending application to the lobby. */
export async function deletePendingApplication({
	lobbyId,
	userId,
}: {
	lobbyId: number;
	userId: number;
}) {
	await db
		.deleteFrom("LobbyApplication")
		.where("LobbyApplication.lobbyId", "=", lobbyId)
		.where("LobbyApplication.userId", "=", userId)
		.where("LobbyApplication.deniedAt", "is", null)
		.execute();
}

/** Denies the user's pending application to the lobby, keeping them from applying again. */
export async function denyApplication({
	lobbyId,
	userId,
}: {
	lobbyId: number;
	userId: number;
}) {
	await db
		.updateTable("LobbyApplication")
		.set({ deniedAt: databaseTimestampNow() })
		.where("LobbyApplication.lobbyId", "=", lobbyId)
		.where("LobbyApplication.userId", "=", userId)
		.where("LobbyApplication.deniedAt", "is", null)
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

/** Removes the users from the lobby and from the lobby's ready checks. Those who played a set keep the lobby's chat as having left it. */
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

	const playedUserIds = await executor
		.selectFrom("LobbySetParticipant")
		.innerJoin("LobbySet", "LobbySet.id", "LobbySetParticipant.setId")
		.select("LobbySetParticipant.userId")
		.distinct()
		.where("LobbySet.lobbyId", "=", lobbyId)
		.where("LobbySetParticipant.userId", "in", userIds)
		.where("LobbySetParticipant.side", "is not", null)
		.execute();
	if (playedUserIds.length === 0) return;

	await executor
		.insertInto("LobbyLeftUser")
		.values(playedUserIds.map(({ userId }) => ({ lobbyId, userId })))
		.onConflict((oc) => oc.columns(["lobbyId", "userId"]).doNothing())
		.execute();
}

/**
 * Removes the user from the lobby right away. If they are playing an unfinished set (`unfinishedSetId`) it ends:
 * a decided result stands, one without a map reported is called off, otherwise their side forfeits. Returns how
 * that set ended, `null` if there was none.
 */
export function removeParticipant(args: ParticipantRemoval) {
	return db
		.transaction()
		.execute((trx) => deleteParticipantEndingSet(args, trx));
}

/**
 * Removes the user from the lobby like {@link removeParticipant}, but without keeping its chat, and keeps them from
 * signing up for it again. For one who already left it only takes the chat away.
 */
export function kickParticipant(args: ParticipantRemoval) {
	return db.transaction().execute(async (trx) => {
		const setEnding = await deleteParticipantEndingSet(args, trx);
		await trx
			.insertInto("LobbyKickedUser")
			.values({ lobbyId: args.lobbyId, userId: args.userId })
			.onConflict((oc) => oc.columns(["lobbyId", "userId"]).doNothing())
			.execute();
		await trx
			.deleteFrom("LobbyLeftUser")
			.where("LobbyLeftUser.lobbyId", "=", args.lobbyId)
			.where("LobbyLeftUser.userId", "=", args.userId)
			.execute();

		return setEnding;
	});
}

/** Updates the settings the host can change after creating the lobby. */
export async function updateSettings({
	id,
	bestOf,
	weaponRandomizer,
	isApplicationRequired,
}: Pick<Tables["Lobby"], "id" | "bestOf" | "weaponRandomizer"> & {
	isApplicationRequired: boolean;
}) {
	await db
		.updateTable("Lobby")
		.set({
			bestOf,
			weaponRandomizer,
			isApplicationRequired: toDBBoolean(isApplicationRequired),
		})
		.where("Lobby.id", "=", id)
		.execute();
}

/** Replaces where the lobby's sets get their maps from: the modes of the players' preferences or a map pool. */
export async function updateMaps({
	id,
	modes,
	mapPool,
	mapsTournamentId,
}: Pick<Tables["Lobby"], "id" | "modes" | "mapPool" | "mapsTournamentId">) {
	await db
		.updateTable("Lobby")
		.set({
			modes: JSON.stringify(modes),
			mapPool: mapPool ? JSON.stringify(mapPool) : null,
			mapsTournamentId,
		})
		.where("Lobby.id", "=", id)
		.execute();
}

/** Replaces who sees the lobby, its new audience in effect right away. Its share key keeps working. */
export function updateVisibility({
	id,
	visibility,
	ownerId,
}: {
	id: number;
	visibility: InsertArgs["visibility"];
	/** The host, whose friends a friends only lobby is visible to */
	ownerId: number;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("ContentVisibility")
			.where("ContentVisibility.lobbyId", "=", id)
			.execute();

		if (visibility === "LINK_ONLY") return;

		await trx
			.insertInto("ContentVisibility")
			.values(
				Visibility.toRows(visibility, {
					createdAt: databaseTimestampNow(),
					ownerId,
				}).map((row) => ({ ...row, lobbyId: id })),
			)
			.execute();
	});
}

/** Replaces the lobby's share key, its old invite link no longer working. */
export async function resetShareKey(id: number) {
	await db
		.updateTable("Lobby")
		.set({ shareKey: shortNanoid() })
		.where("Lobby.id", "=", id)
		.execute();
}

/** The `ContentVisibility` rows of the lobby in the order they come into effect, with the names of their associations. */
export function findVisibilityRowsById(id: number) {
	return db
		.selectFrom("ContentVisibility")
		.leftJoin(
			"Association",
			"Association.id",
			"ContentVisibility.associationId",
		)
		.select([
			"ContentVisibility.visibleFrom",
			"ContentVisibility.associationId",
			"Association.name as associationName",
			"ContentVisibility.plusTier",
			"ContentVisibility.friendsOfUserId",
			"ContentVisibility.isPublic",
		])
		.where("ContentVisibility.lobbyId", "=", id)
		.orderBy("ContentVisibility.visibleFrom", "asc")
		.orderBy("ContentVisibility.id", "asc")
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
		checkInOpenedAt?: number;
	},
	trx?: Transaction<DB>,
) {
	await (trx ?? db)
		.updateTable("Lobby")
		.set(values)
		.where("Lobby.id", "=", id)
		.execute();
}

/** Deletes the lobby with everything of it, its chat room left to the orphaned rooms cleanup. */
export async function deleteById(id: number) {
	await db.deleteFrom("Lobby").where("Lobby.id", "=", id).execute();
}

/**
 * Ends the lobby. Its chat rooms become inactive, nobody counts as active in it anymore, its applications are
 * dropped and so are sets that hadn't got a single map reported. The placements of its leaderboard are saved as the players' results.
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
			.select("Lobby.chatRoomId")
			.where("Lobby.id", "=", id)
			.executeTakeFirstOrThrow();
		const sets = await trx
			.selectFrom("LobbySet")
			.select(["LobbySet.alphaChatRoomId", "LobbySet.bravoChatRoomId"])
			.where("LobbySet.lobbyId", "=", id)
			.execute();

		await ChatRepository.updateRoomsInactive(
			[
				lobby.chatRoomId,
				...sets.flatMap((set) => [set.alphaChatRoomId, set.bravoChatRoomId]),
			],
			true,
			trx,
		);

		await trx
			.deleteFrom("LobbyReadyCheck")
			.where("LobbyReadyCheck.lobbyId", "=", id)
			.execute();

		await trx
			.deleteFrom("LobbyApplication")
			.where("LobbyApplication.lobbyId", "=", id)
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

		const results = Leaderboard.rows({
			sets: await LobbyMatchRepository.findAllSetsByLobbyId(id, trx),
			weapons: [],
		});
		if (results.length > 0) {
			await trx
				.insertInto("LobbyResult")
				.values(
					results.map((row) => ({
						lobbyId: id,
						userId: row.userId,
						placement: row.placement,
					})),
				)
				.onConflict((oc) => oc.doNothing())
				.execute();
		}
	});
}

/** Placements the user got in the ended lobbies they played a finished set in, one per lobby. */
export function findResultPlacementsByUserId(userId: number) {
	return db
		.selectFrom("LobbyResult")
		.select("LobbyResult.placement")
		.where("LobbyResult.userId", "=", userId)
		.execute();
}

/** A link-only lobby has no `ContentVisibility` rows, its share link being the only way in for others. */
function mapsTournamentName(eb: ExpressionBuilder<DB, "Lobby">) {
	return eb
		.selectFrom("CalendarEvent")
		.select("CalendarEvent.name")
		.whereRef("CalendarEvent.tournamentId", "=", "Lobby.mapsTournamentId")
		.limit(1);
}

function isLinkOnly(eb: ExpressionBuilder<DB, "Lobby">) {
	return eb.not(
		eb.exists(
			eb
				.selectFrom("ContentVisibility")
				.select("ContentVisibility.id")
				.whereRef("ContentVisibility.lobbyId", "=", "Lobby.id"),
		),
	);
}

function participatedIn(eb: ExpressionBuilder<DB, "Lobby">, userId: number) {
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
		eb.exists(
			eb
				.selectFrom("LobbyLeftUser")
				.select("LobbyLeftUser.userId")
				.whereRef("LobbyLeftUser.lobbyId", "=", "Lobby.id")
				.where("LobbyLeftUser.userId", "=", userId),
		),
	]);
}

async function deleteParticipantEndingSet(
	{ lobbyId, userId, unfinishedSetId }: ParticipantRemoval,
	trx: Transaction<DB>,
) {
	const setEnding =
		unfinishedSetId !== null
			? await LobbyMatchRepository.endLeftSet(
					{ setId: unfinishedSetId, userId },
					trx,
				)
			: null;

	await deleteParticipants({ lobbyId, userIds: [userId] }, trx);

	return setEnding;
}
