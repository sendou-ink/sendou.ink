import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { isAdmin, isStaff } from "~/modules/permissions/utils";
import { databaseTimestampNow } from "~/utils/dates";
import {
	jsonArrayFrom,
	tournamentLogoWithDefault,
} from "~/utils/kysely.server";
import {
	SENDOUQ_LOOKING_PAGE,
	scrimPage,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentSubsPage,
} from "~/utils/urls";
import type { ChatRoomType } from "./chat-types";

// xxx: direct DB calls here, should not be a thing, the logic also seems quite heavy, needed?

export interface ResolvedRoom {
	roomId: number;
	type: ChatRoomType;
	/** Interpolation values for the client-localized room title, keyed per room type. */
	titleParams: Record<string, string>;
	url: string;
	imageUrl: string | null;
	participantUserIds: number[];
	/**
	 * Read-only observers resolved from the owning entity (tournament organizers and
	 * streamers). Site ADMIN/STAFF observe through the role axis instead, see
	 * {@link canObserve}.
	 */
	observerUserIds: number[];
	expiresAt: number;
	closedAt: number | null;
}

type ChatRoomRow = Tables["ChatRoom"];

/**
 * Resolves rooms' participants, titles and access live from their owning entities.
 * Rooms whose owner row is gone resolve to nothing.
 */
export async function resolve(roomIds: number[]): Promise<ResolvedRoom[]> {
	if (roomIds.length === 0) return [];

	const rooms = await db
		.selectFrom("ChatRoom")
		.selectAll()
		.where("ChatRoom.id", "in", roomIds)
		.execute();

	const byType = (type: ChatRoomType) =>
		rooms.filter((room) => room.type === type);

	const resolved = (
		await Promise.all([
			resolveSqGroupRooms(byType("SQ_GROUP")),
			resolveSqMatchRooms(byType("SQ_MATCH")),
			resolveTournamentMatchRooms(byType("TOURNAMENT_MATCH")),
			resolveTournamentTeamRooms(byType("TOURNAMENT_TEAM")),
			resolveScrimRooms(byType("SCRIM")),
		])
	).flat();

	return resolved.sort((a, b) => a.roomId - b.roomId);
}

/**
 * Rooms the user currently participates in (unexpired and unclosed). Room-first per
 * the resolver spike: drives from the open room set and probes membership through
 * the owner tables' indexes, never searching on the JSON opponent ids.
 */
export async function findAllByUserId(userId: number): Promise<ResolvedRoom[]> {
	const now = databaseTimestampNow();

	const openRooms = () =>
		db
			.selectFrom("ChatRoom")
			.select("ChatRoom.id")
			.where("ChatRoom.expiresAt", ">", now)
			.where("ChatRoom.closedAt", "is", null);

	const [groupRooms, matchRooms, tournamentMatchRooms, teamRooms, scrimRooms] =
		await Promise.all([
			openRooms()
				.innerJoin("Group", "Group.chatRoomId", "ChatRoom.id")
				.where(({ exists, selectFrom }) =>
					exists(
						selectFrom("GroupMember")
							.select("GroupMember.userId")
							.whereRef("GroupMember.groupId", "=", "Group.id")
							.where("GroupMember.userId", "=", userId),
					),
				)
				.execute(),
			openRooms()
				.innerJoin("GroupMatch", "GroupMatch.chatRoomId", "ChatRoom.id")
				.where(({ exists, selectFrom }) =>
					exists(
						selectFrom("GroupMember")
							.select("GroupMember.userId")
							.where("GroupMember.userId", "=", userId)
							.where((eb) =>
								eb.or([
									eb(
										"GroupMember.groupId",
										"=",
										eb.ref("GroupMatch.alphaGroupId"),
									),
									eb(
										"GroupMember.groupId",
										"=",
										eb.ref("GroupMatch.bravoGroupId"),
									),
								]),
							),
					),
				)
				.execute(),
			openRooms()
				.innerJoin(
					"TournamentMatch",
					"TournamentMatch.chatRoomId",
					"ChatRoom.id",
				)
				.where(({ exists, selectFrom }) =>
					exists(
						selectFrom("TournamentTeamMember")
							.select("TournamentTeamMember.userId")
							.where("TournamentTeamMember.userId", "=", userId)
							.where((eb) =>
								eb.or([
									eb(
										"TournamentTeamMember.tournamentTeamId",
										"=",
										opponentTeamId("opponentOne"),
									),
									eb(
										"TournamentTeamMember.tournamentTeamId",
										"=",
										opponentTeamId("opponentTwo"),
									),
								]),
							),
					),
				)
				.execute(),
			openRooms()
				.innerJoin("TournamentTeam", "TournamentTeam.chatRoomId", "ChatRoom.id")
				.where(({ exists, selectFrom }) =>
					exists(
						selectFrom("TournamentTeamMember")
							.select("TournamentTeamMember.userId")
							.whereRef(
								"TournamentTeamMember.tournamentTeamId",
								"=",
								"TournamentTeam.id",
							)
							.where("TournamentTeamMember.userId", "=", userId),
					),
				)
				.execute(),
			openRooms()
				.innerJoin("ScrimPost", "ScrimPost.chatRoomId", "ChatRoom.id")
				.where((eb) =>
					eb.or([
						eb.exists(
							eb
								.selectFrom("ScrimPostUser")
								.select("ScrimPostUser.userId")
								.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id")
								.where("ScrimPostUser.userId", "=", userId),
						),
						eb.exists(
							eb
								.selectFrom("ScrimPostRequestUser")
								.innerJoin(
									"ScrimPostRequest",
									"ScrimPostRequest.id",
									"ScrimPostRequestUser.scrimPostRequestId",
								)
								.select("ScrimPostRequestUser.userId")
								.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
								.where("ScrimPostRequest.isAccepted", "=", 1)
								.where("ScrimPostRequestUser.userId", "=", userId),
						),
					]),
				)
				.execute(),
		]);

	const resolved = await resolve(
		[
			...groupRooms,
			...matchRooms,
			...tournamentMatchRooms,
			...teamRooms,
			...scrimRooms,
		].map((room) => room.id),
	);

	// a solo group has no conversation to show yet
	return resolved.filter(
		(room) => room.type !== "SQ_GROUP" || room.participantUserIds.length >= 2,
	);
}

/** Whether the user has read-only observer access to the room: site ADMIN/STAFF, or an observer resolved from the owning entity. */
export function canObserve(room: ResolvedRoom, userId: number): boolean {
	return (
		isAdmin({ id: userId }) ||
		isStaff({ id: userId }) ||
		room.observerUserIds.includes(userId)
	);
}

/** Whether the user may read the room. After `closedAt` only observers retain access. */
export function canView(room: ResolvedRoom, userId: number): boolean {
	if (room.closedAt !== null) return canObserve(room, userId);

	return room.participantUserIds.includes(userId) || canObserve(room, userId);
}

/** Whether the user may post to the room: participants only, while the room is unexpired and unclosed. */
export function canPost(room: ResolvedRoom, userId: number): boolean {
	if (room.closedAt !== null) return false;
	if (room.expiresAt <= databaseTimestampNow()) return false;

	return room.participantUserIds.includes(userId);
}

function opponentTeamId(column: "opponentOne" | "opponentTwo") {
	return sql<number>`${sql.ref(`TournamentMatch.${column}`)} ->> '$.id'`;
}

async function resolveSqGroupRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await db
		.selectFrom("Group")
		.select((eb) => [
			"Group.chatRoomId",
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.whereRef("GroupMember.groupId", "=", "Group.id"),
			).as("members"),
		])
		.where(
			"Group.chatRoomId",
			"in",
			rooms.map((room) => room.id),
		)
		.execute();

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: {},
		url: SENDOUQ_LOOKING_PAGE,
		imageUrl: null,
		participantUserIds: owner.members.map((member) => member.userId),
		observerUserIds: [],
	}));
}

async function resolveSqMatchRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await db
		.selectFrom("GroupMatch")
		.select((eb) => [
			"GroupMatch.id",
			"GroupMatch.chatRoomId",
			jsonArrayFrom(
				eb
					.selectFrom("GroupMember")
					.select("GroupMember.userId")
					.where((inner) =>
						inner.or([
							inner(
								"GroupMember.groupId",
								"=",
								inner.ref("GroupMatch.alphaGroupId"),
							),
							inner(
								"GroupMember.groupId",
								"=",
								inner.ref("GroupMatch.bravoGroupId"),
							),
						]),
					),
			).as("members"),
		])
		.where(
			"GroupMatch.chatRoomId",
			"in",
			rooms.map((room) => room.id),
		)
		.execute();

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: { matchId: String(owner.id) },
		url: sendouQMatchPage(owner.id),
		imageUrl: null,
		participantUserIds: owner.members.map((member) => member.userId),
		observerUserIds: [],
	}));
}

async function resolveTournamentMatchRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentStage.tournamentId",
		)
		.select((eb) => [
			"TournamentMatch.id",
			"TournamentMatch.chatRoomId",
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentStage.tournamentId",
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where(
			"TournamentMatch.chatRoomId",
			"in",
			rooms.map((room) => room.id),
		)
		.execute();

	// the opponent team ids come from the already-fetched match rows; they are
	// never used as search predicates (see the resolver SQL spike)
	const teamIds = [
		...new Set(
			owners.flatMap((owner) =>
				[owner.opponentOne?.id, owner.opponentTwo?.id].filter(
					(id): id is number => typeof id === "number",
				),
			),
		),
	];
	const members =
		teamIds.length > 0
			? await db
					.selectFrom("TournamentTeamMember")
					.select([
						"TournamentTeamMember.tournamentTeamId",
						"TournamentTeamMember.userId",
					])
					.where("TournamentTeamMember.tournamentTeamId", "in", teamIds)
					.execute()
			: [];

	const observers = await observersByTournamentId([
		...new Set(owners.map((owner) => owner.tournamentId)),
	]);

	return joinOwners(rooms, owners, (owner) => {
		const opponentTeamIds = [
			owner.opponentOne?.id,
			owner.opponentTwo?.id,
		].filter((id): id is number => typeof id === "number");
		const tournamentObservers = observers.get(owner.tournamentId);

		return {
			titleParams: {
				tournamentName: owner.tournamentName,
				matchId: String(owner.id),
			},
			url: tournamentMatchPage({
				tournamentId: owner.tournamentId,
				matchId: owner.id,
			}),
			imageUrl: owner.logoUrl,
			participantUserIds: members
				.filter((member) => opponentTeamIds.includes(member.tournamentTeamId))
				.map((member) => member.userId),
			observerUserIds: [
				...(tournamentObservers?.organizerIds ?? []),
				...(tournamentObservers?.streamerIds ?? []),
			],
		};
	});
}

async function resolveTournamentTeamRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await db
		.selectFrom("TournamentTeam")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentTeam.tournamentId",
		)
		.select((eb) => [
			"TournamentTeam.chatRoomId",
			"TournamentTeam.name",
			"TournamentTeam.tournamentId",
			"CalendarEvent.name as tournamentName",
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeamMember")
					.select("TournamentTeamMember.userId")
					.whereRef(
						"TournamentTeamMember.tournamentTeamId",
						"=",
						"TournamentTeam.id",
					),
			).as("members"),
		])
		.where(
			"TournamentTeam.chatRoomId",
			"in",
			rooms.map((room) => room.id),
		)
		.execute();

	const observers = await observersByTournamentId([
		...new Set(owners.map((owner) => owner.tournamentId)),
	]);

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: {
			teamName: owner.name,
			tournamentName: owner.tournamentName,
		},
		url: tournamentSubsPage(owner.tournamentId),
		imageUrl: owner.logoUrl,
		participantUserIds: owner.members.map((member) => member.userId),
		observerUserIds: observers.get(owner.tournamentId)?.organizerIds ?? [],
	}));
}

async function resolveScrimRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await db
		.selectFrom("ScrimPost")
		.select((eb) => [
			"ScrimPost.id",
			"ScrimPost.chatRoomId",
			"ScrimPost.startsAt",
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPostUser")
					.select("ScrimPostUser.userId")
					.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
			).as("postUsers"),
			jsonArrayFrom(
				eb
					.selectFrom("ScrimPostRequestUser")
					.innerJoin(
						"ScrimPostRequest",
						"ScrimPostRequest.id",
						"ScrimPostRequestUser.scrimPostRequestId",
					)
					.select("ScrimPostRequestUser.userId")
					.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
					.where("ScrimPostRequest.isAccepted", "=", 1),
			).as("acceptedRequestUsers"),
			eb
				.selectFrom("ScrimPostRequest")
				.select("ScrimPostRequest.startsAt")
				.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id")
				.where("ScrimPostRequest.isAccepted", "=", 1)
				.limit(1)
				.$asScalar()
				.as("acceptedRequestStartsAt"),
		])
		.where(
			"ScrimPost.chatRoomId",
			"in",
			rooms.map((room) => room.id),
		)
		.execute();

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: {
			startsAt: String(owner.acceptedRequestStartsAt ?? owner.startsAt),
		},
		url: scrimPage(owner.id),
		imageUrl: null,
		participantUserIds: [
			...owner.postUsers.map((user) => user.userId),
			...owner.acceptedRequestUsers.map((user) => user.userId),
		],
		observerUserIds: [],
	}));
}

function joinOwners<T extends { chatRoomId: number | null }>(
	rooms: ChatRoomRow[],
	owners: T[],
	build: (
		owner: T,
	) => Pick<
		ResolvedRoom,
		| "titleParams"
		| "url"
		| "imageUrl"
		| "participantUserIds"
		| "observerUserIds"
	>,
): ResolvedRoom[] {
	const ownerByRoomId = new Map(
		owners.map((owner) => [owner.chatRoomId, owner]),
	);

	return rooms.flatMap((room) => {
		const owner = ownerByRoomId.get(room.id);
		if (!owner) return [];

		return {
			roomId: room.id,
			type: room.type,
			expiresAt: room.expiresAt,
			closedAt: room.closedAt,
			...build(owner),
		};
	});
}

type TournamentObservers = {
	organizerIds: number[];
	streamerIds: number[];
};

async function observersByTournamentId(
	tournamentIds: number[],
): Promise<Map<number, TournamentObservers>> {
	const result = new Map<number, TournamentObservers>();
	if (tournamentIds.length === 0) return result;

	const observersOf = (tournamentId: number) => {
		let observers = result.get(tournamentId);
		if (!observers) {
			observers = { organizerIds: [], streamerIds: [] };
			result.set(tournamentId, observers);
		}
		return observers;
	};

	const events = await db
		.selectFrom("CalendarEvent")
		.select([
			"CalendarEvent.tournamentId",
			"CalendarEvent.authorId",
			"CalendarEvent.organizationId",
		])
		.where("CalendarEvent.tournamentId", "in", tournamentIds)
		.execute();
	const staff = await db
		.selectFrom("TournamentStaff")
		.select([
			"TournamentStaff.tournamentId",
			"TournamentStaff.userId",
			"TournamentStaff.role",
		])
		.where("TournamentStaff.tournamentId", "in", tournamentIds)
		.execute();

	const organizationIds = [
		...new Set(
			events
				.map((event) => event.organizationId)
				.filter((id): id is number => id !== null),
		),
	];
	const organizationMembers =
		organizationIds.length > 0
			? await db
					.selectFrom("TournamentOrganizationMember")
					.select([
						"TournamentOrganizationMember.organizationId",
						"TournamentOrganizationMember.userId",
						"TournamentOrganizationMember.role",
					])
					.where(
						"TournamentOrganizationMember.organizationId",
						"in",
						organizationIds,
					)
					.where("TournamentOrganizationMember.role", "in", [
						"ADMIN",
						"ORGANIZER",
						"STREAMER",
					])
					.execute()
			: [];

	for (const event of events) {
		if (event.tournamentId === null) continue;
		const observers = observersOf(event.tournamentId);
		observers.organizerIds.push(event.authorId);

		for (const member of organizationMembers) {
			if (member.organizationId !== event.organizationId) continue;
			if (member.role === "STREAMER") {
				observers.streamerIds.push(member.userId);
			} else {
				observers.organizerIds.push(member.userId);
			}
		}
	}

	for (const staffMember of staff) {
		const observers = observersOf(staffMember.tournamentId);
		if (staffMember.role === "STREAMER") {
			observers.streamerIds.push(staffMember.userId);
		} else {
			observers.organizerIds.push(staffMember.userId);
		}
	}

	return result;
}
