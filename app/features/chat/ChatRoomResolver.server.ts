import * as R from "remeda";
import type { Tables } from "~/db/tables";
import { ADMIN_ID, STAFF_IDS } from "~/features/admin/admin-constants";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import {
	SENDOUQ_LOOKING_PAGE,
	scrimPage,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentSubsPage,
} from "~/utils/urls";
import * as ChatRepository from "./ChatRepository.server";
import type { ChatRoomType } from "./chat-types";

/** Room types whose observers may also post: the shared spaces where a TO or staff member talks to the players. Group and team chats stay read-only — a private team space is only ever read for moderation. */
const OBSERVER_POSTABLE_ROOM_TYPES: ChatRoomType[] = [
	"SQ_MATCH",
	"TOURNAMENT_MATCH",
	"SCRIM",
];

/** Site staff read every room for moderation; the admin account holds the staff role too. */
const SITE_MODERATOR_IDS = [ADMIN_ID, ...STAFF_IDS];

export interface ResolvedRoom {
	roomId: number;
	type: ChatRoomType;
	/** Interpolation values for the client-localized room title, keyed per room type. */
	titleParams: Record<string, string>;
	url: string;
	imageUrl: string | null;
	participantUserIds: number[];
	/**
	 * - `VIEW`: reading the room. After `closedAt` only observers keep it.
	 * - `POST`: sending a message, while the room is unexpired and unclosed.
	 * - `OBSERVE`: read-only access resolved from the owning entity (tournament
	 *   organizers and streamers), plus site staff who observe every room.
	 */
	permissions: {
		VIEW: number[];
		POST: number[];
		OBSERVE: number[];
	};
	expiresAt: number;
	closedAt: number | null;
	/** Whether the owner's activity has concluded (e.g. the match was finalized). */
	inactive: boolean;
}

type ChatRoomRow = Tables["ChatRoom"];

/**
 * Resolves rooms' participants, titles and access live from their owning entities.
 * Rooms whose owner row is gone resolve to nothing.
 */
export async function resolve(roomIds: number[]): Promise<ResolvedRoom[]> {
	if (roomIds.length === 0) return [];

	const rooms = await ChatRepository.findAllRoomsByIds(roomIds);

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

/** Rooms the user currently participates in (unexpired and unclosed). */
export async function findAllByUserId(userId: number): Promise<ResolvedRoom[]> {
	const roomIds = await ChatRepository.findAllOpenRoomIdsByUserId(userId);

	const resolved = await resolve(roomIds);

	// a solo group has no conversation to show yet
	return resolved.filter(
		(room) => room.type !== "SQ_GROUP" || room.participantUserIds.length >= 2,
	);
}

async function resolveSqGroupRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await SQGroupRepository.findAllByChatRoomIds(
		rooms.map((room) => room.id),
	);

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: {},
		url: SENDOUQ_LOOKING_PAGE,
		imageUrl: null,
		participantUserIds: owner.members.map((member) => member.userId),
		observerUserIds: [],
		// derived live instead of a persisted flag: a dead group can never chat again
		inactive: owner.status === "INACTIVE",
	}));
}

async function resolveSqMatchRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await SQMatchRepository.findAllByChatRoomIds(
		rooms.map((room) => room.id),
	);

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

	const owners = await TournamentMatchRepository.findAllByChatRoomIds(
		rooms.map((room) => room.id),
	);

	// the opponent team ids come from the already-fetched match rows; they are
	// never used as search predicates (see the resolver SQL spike)
	const teamIds = R.unique(
		owners.flatMap((owner) =>
			[owner.opponentOne?.id, owner.opponentTwo?.id].filter(
				(id): id is number => typeof id === "number",
			),
		),
	);
	const [members, organizers] = await Promise.all([
		TournamentTeamRepository.findAllMembersByTeamIds(teamIds),
		TournamentRepository.findOrganizerPermissionsByTournamentIds(
			R.unique(owners.map((owner) => owner.tournamentId)),
		),
	]);

	return joinOwners(rooms, owners, (owner) => {
		const opponentTeamIds = [
			owner.opponentOne?.id,
			owner.opponentTwo?.id,
		].filter((id): id is number => typeof id === "number");

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
			// streamers cast the matches, so they observe them as well
			observerUserIds: organizers.get(owner.tournamentId)?.MANAGE_MATCHES ?? [],
		};
	});
}

async function resolveTournamentTeamRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await TournamentTeamRepository.findAllByChatRoomIds(
		rooms.map((room) => room.id),
	);

	const organizers =
		await TournamentRepository.findOrganizerPermissionsByTournamentIds(
			R.unique(owners.map((owner) => owner.tournamentId)),
		);

	return joinOwners(rooms, owners, (owner) => ({
		titleParams: {
			teamName: owner.name,
			tournamentName: owner.tournamentName,
		},
		url: tournamentSubsPage(owner.tournamentId),
		imageUrl: owner.logoUrl,
		participantUserIds: owner.members.map((member) => member.userId),
		observerUserIds: organizers.get(owner.tournamentId)?.ORGANIZE ?? [],
	}));
}

async function resolveScrimRooms(
	rooms: ChatRoomRow[],
): Promise<ResolvedRoom[]> {
	if (rooms.length === 0) return [];

	const owners = await ScrimPostRepository.findAllByChatRoomIds(
		rooms.map((room) => room.id),
	);

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

function joinOwners<T extends { chatRoomId: number }>(
	rooms: ChatRoomRow[],
	owners: T[],
	build: (owner: T) => Pick<
		ResolvedRoom,
		"titleParams" | "url" | "imageUrl"
	> & {
		participantUserIds: number[];
		observerUserIds: number[];
	} & Partial<Pick<ResolvedRoom, "inactive">>,
): ResolvedRoom[] {
	const ownerByRoomId = new Map(
		owners.map((owner) => [owner.chatRoomId, owner]),
	);

	return rooms.flatMap((room) => {
		const owner = ownerByRoomId.get(room.id);
		if (!owner) return [];

		const { observerUserIds, ...built } = build(owner);

		return {
			roomId: room.id,
			type: room.type,
			expiresAt: room.expiresAt,
			closedAt: room.closedAt,
			inactive: Boolean(room.inactive),
			...built,
			permissions: permissionsOf({
				room,
				participantUserIds: built.participantUserIds,
				observerUserIds,
			}),
		};
	});
}

/** Who may view, post to and observe a room, given the participants and observers its owner resolved to. */
export function permissionsOf(args: {
	room: Pick<ChatRoomRow, "type" | "expiresAt" | "closedAt">;
	participantUserIds: number[];
	observerUserIds: number[];
}): ResolvedRoom["permissions"] {
	const closed = args.room.closedAt !== null;
	const expired = args.room.expiresAt <= databaseTimestampNow();
	const OBSERVE = R.unique([...args.observerUserIds, ...SITE_MODERATOR_IDS]);
	const observersMayPost = OBSERVER_POSTABLE_ROOM_TYPES.includes(
		args.room.type,
	);

	return {
		VIEW: closed ? OBSERVE : R.unique([...args.participantUserIds, ...OBSERVE]),
		POST:
			closed || expired
				? []
				: R.unique([
						...args.participantUserIds,
						...(observersMayPost ? OBSERVE : []),
					]),
		OBSERVE,
	};
}
