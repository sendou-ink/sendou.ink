import { addHours, subHours } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import * as ChatRepository from "./ChatRepository.server";
import * as ChatRoomResolver from "./ChatRoomResolver.server";
import { setupSqMatch } from "./tests/fixtures";

const users = UserFactory.pool();

// ADMIN_ID is 1 under NODE_ENV=test, so the first pool user is site staff
const adminId = () => users.id(1);
const outsiderId = () => users.id(11);

beforeEach(async () => {
	await users.create(12);
});

const setupStartedTournamentMatch = async () => {
	const authorId = users.id(2);
	const teamAlphaUserIds = [users.id(3), users.id(4), users.id(5), users.id(6)];
	const teamBravoUserIds = [
		users.id(7),
		users.id(8),
		users.id(9),
		users.id(10),
	];

	const tournament = await TournamentFactory.create({ authorId });
	for (const memberUserIds of [teamAlphaUserIds, teamBravoUserIds]) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds },
			{ isCheckedIn: true },
		);
	}
	await TournamentFactory.startBracket(tournament.id);

	const match = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select(["TournamentMatch.id", "TournamentMatch.chatRoomId"])
		.where("TournamentStage.tournamentId", "=", tournament.id)
		.where("TournamentMatch.chatRoomId", "is not", null)
		.executeTakeFirstOrThrow();

	return {
		tournament,
		authorId,
		matchId: match.id,
		chatRoomId: match.chatRoomId!,
		teamAlphaUserIds,
		teamBravoUserIds,
	};
};

const setupAcceptedScrim = async () => {
	const postUserIds = [users.id(2), users.id(3)];
	const requestUserIds = [users.id(4), users.id(5)];
	const startsAt = addHours(new Date(), 10);

	const { id: postId } = await ScrimPostFactory.create({
		startsAt: dateToDatabaseTimestamp(startsAt),
		users: postUserIds.map((userId, i) => ({
			userId,
			isOwner: i === 0 ? (1 as const) : (0 as const),
		})),
	});
	const team = await TeamFactory.create({ memberUserIds: requestUserIds });
	const requestId = await ScrimPostRepository.insertRequest({
		scrimPostId: postId,
		teamId: team.id,
		message: null,
		startsAt: null,
		users: requestUserIds.map((userId, i) => ({
			userId,
			isOwner: i === 0 ? (1 as const) : (0 as const),
		})),
	});
	await ScrimPostRepository.acceptRequest(requestId);

	const post = await ScrimPostRepository.findById(postId);

	return {
		postId,
		chatRoomId: post!.chatRoomId!,
		postUserIds,
		requestUserIds,
		startsAt,
	};
};

describe("ChatRoomResolver.resolve", () => {
	test("resolves an SQ_GROUP room to the group's live members", async () => {
		const memberUserIds = [users.id(2), users.id(3)];
		const group = await SQGroupFactory.create({ memberUserIds });

		const room = await resolveOrThrow(await groupChatRoomId(group.id));

		expect(room.type).toBe("SQ_GROUP");
		expect(room.participantUserIds.sort()).toEqual(memberUserIds.sort());
		expect(room.url).toBe("/q/looking");
		// a group chat resolves no observers of its own, site staff aside
		expect(hasPermission(room, "OBSERVE", { id: outsiderId() })).toBe(false);
		expect(room.inactive).toBe(false);
	});

	test("marks a dead group's room inactive", async () => {
		const group = await SQGroupFactory.create({
			memberUserIds: [users.id(2), users.id(3)],
		});
		await SQGroupRepository.setAsInactive(group.id);

		const room = await resolveOrThrow(await groupChatRoomId(group.id));

		expect(room.inactive).toBe(true);
	});

	test("resolves an SQ_MATCH room to both groups' members", async () => {
		const { match, alphaUserIds, bravoUserIds } = await setupSqMatch(users);

		const room = await resolveOrThrow(match.chatRoomId!);

		expect(room.type).toBe("SQ_MATCH");
		expect(room.participantUserIds.sort()).toEqual(
			[...alphaUserIds, ...bravoUserIds].sort(),
		);
		expect(room.titleParams).toEqual({ matchId: String(match.id) });
		expect(room.url).toContain(String(match.id));
	});

	test("resolves a TOURNAMENT_MATCH room to both teams' members with organizer observers", async () => {
		const {
			chatRoomId,
			matchId,
			authorId,
			teamAlphaUserIds,
			teamBravoUserIds,
		} = await setupStartedTournamentMatch();

		const room = await resolveOrThrow(chatRoomId);

		expect(room.type).toBe("TOURNAMENT_MATCH");
		expect(room.participantUserIds.sort()).toEqual(
			[...teamAlphaUserIds, ...teamBravoUserIds].sort(),
		);
		expect(room.titleParams.matchId).toBe(String(matchId));
		expect(room.titleParams.tournamentName).toEqual(expect.any(String));
		expect(room.permissions.OBSERVE).toContain(authorId);
	});

	test("TOURNAMENT_MATCH observers include tournament staff organizers and streamers", async () => {
		const { tournament, chatRoomId } = await setupStartedTournamentMatch();
		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff: [{ userId: users.id(12), role: "STREAMER" }],
		});

		const room = await resolveOrThrow(chatRoomId);

		expect(room.permissions.OBSERVE).toContain(users.id(12));
	});

	test("resolves a TOURNAMENT_TEAM room to the pickup team's members", async () => {
		const authorId = users.id(2);
		const memberUserIds = [users.id(3), users.id(4)];
		const tournament = await TournamentFactory.create({ authorId });
		const team = await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds },
			{ isLooking: true },
		);

		const room = await resolveOrThrow(await teamChatRoomId(team.id));

		expect(room.type).toBe("TOURNAMENT_TEAM");
		expect(room.participantUserIds.sort()).toEqual(memberUserIds.sort());
		expect(room.titleParams.teamName).toEqual(expect.any(String));
		expect(room.permissions.OBSERVE).toContain(authorId);
	});

	test("resolves a SCRIM room to the post's users plus the accepted request's users", async () => {
		const { chatRoomId, postUserIds, requestUserIds, startsAt } =
			await setupAcceptedScrim();

		const room = await resolveOrThrow(chatRoomId);

		expect(room.type).toBe("SCRIM");
		expect(room.participantUserIds.sort()).toEqual(
			[...postUserIds, ...requestUserIds].sort(),
		);
		expect(room.titleParams.startsAt).toBe(
			String(dateToDatabaseTimestamp(startsAt)),
		);
	});

	test("resolves to nothing when the owner row is gone", async () => {
		const { postId, chatRoomId } = await setupAcceptedScrim();
		// deleting an owner in a way that skips its delete transaction would orphan
		// the room; simulate by resolving an id the reaper would clean up
		await ScrimPostRepository.deleteById(postId);

		expect(await ChatRoomResolver.resolve(chatRoomId)).toBeNull();
	});
});

describe("ChatRoomResolver.findAllByUserId", () => {
	test("returns the member's own group and match rooms of an SQ match", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const rooms = await ChatRoomResolver.findAllByUserId(alphaUserIds[0]);

		expect(rooms.map((room) => [room.roomId, room.type]).sort()).toEqual(
			[
				[match.chatRoomId!, "SQ_MATCH"],
				[await groupChatRoomId(match.alphaGroup.id), "SQ_GROUP"],
			].sort(),
		);
	});

	test("leaves out a solo group's room", async () => {
		await SQGroupFactory.create({ memberUserIds: [users.id(2)] });

		expect(await ChatRoomResolver.findAllByUserId(users.id(2))).toEqual([]);
	});

	test("returns tournament match and team rooms through membership", async () => {
		const { chatRoomId, teamAlphaUserIds } =
			await setupStartedTournamentMatch();

		const rooms = await ChatRoomResolver.findAllByUserId(teamAlphaUserIds[0]);

		expect(rooms.map((room) => room.roomId)).toContain(chatRoomId);
	});

	test("returns scrim rooms for both sides", async () => {
		const { chatRoomId, requestUserIds } = await setupAcceptedScrim();

		const rooms = await ChatRoomResolver.findAllByUserId(requestUserIds[1]);

		expect(rooms.map((room) => room.roomId)).toEqual([chatRoomId]);
	});

	test("returns nothing for a non-participant", async () => {
		await setupSqMatch(users);
		await setupAcceptedScrim();

		expect(await ChatRoomResolver.findAllByUserId(outsiderId())).toEqual([]);
	});

	test("leaves out expired rooms", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);
		await ChatRepository.updateRoomExpiresAt({
			roomId: match.chatRoomId!,
			expiresAt: subHours(new Date(), 1),
		});

		const rooms = await ChatRoomResolver.findAllByUserId(alphaUserIds[0]);

		expect(rooms.map((room) => room.roomId)).toEqual([
			await groupChatRoomId(match.alphaGroup.id),
		]);
	});

	test("leaves out closed rooms", async () => {
		const { requestUserIds } = await setupAcceptedScrim();
		await ChatRepository.closeExpiredRooms(addHours(new Date(), 100_000));

		expect(await ChatRoomResolver.findAllByUserId(requestUserIds[0])).toEqual(
			[],
		);
	});
});

describe("ChatRoomResolver.resolve labels", () => {
	test("labels the tournament's organizers TO and its streamers Stream", async () => {
		const { tournament, chatRoomId, authorId } =
			await setupStartedTournamentMatch();
		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff: [
				{ userId: users.id(11), role: "ORGANIZER" },
				{ userId: users.id(12), role: "STREAMER" },
			],
		});

		const room = await resolveOrThrow(chatRoomId);

		expect(room.labelByUserId).toEqual({
			[authorId]: "TO",
			[users.id(11)]: "TO",
			[users.id(12)]: "Stream",
		});
	});

	test("leaves out an organizer playing in the room's own match", async () => {
		const { tournament, chatRoomId, teamAlphaUserIds } =
			await setupStartedTournamentMatch();
		await TournamentRepository.setStaff({
			tournamentId: tournament.id,
			staff: [{ userId: teamAlphaUserIds[0], role: "ORGANIZER" }],
		});

		const room = await resolveOrThrow(chatRoomId);

		expect(room.labelByUserId[teamAlphaUserIds[0]]).toBeUndefined();
	});

	test("labels no one in a room with no tournament behind it", async () => {
		const { chatRoomId } = await setupAcceptedScrim();

		const room = await resolveOrThrow(chatRoomId);

		expect(room.labelByUserId).toEqual({});
	});
});

describe("ChatRoomResolver.resolve permissions", () => {
	test("site staff observe both group chats of an SQ match", async () => {
		const { match } = await setupSqMatch(users);

		const rooms = await Promise.all(
			[
				match.chatRoomId!,
				await groupChatRoomId(match.alphaGroup.id),
				await groupChatRoomId(match.bravoGroup.id),
			].map(resolveOrThrow),
		);

		for (const room of rooms) {
			expect(hasPermission(room, "OBSERVE", { id: adminId() })).toBe(true);
			expect(hasPermission(room, "OBSERVE", { id: outsiderId() })).toBe(false);
		}
	});

	test("a participant of one group cannot view the other group's chat", async () => {
		const { match, alphaUserIds } = await setupSqMatch(users);

		const bravoRoom = await resolveOrThrow(
			await groupChatRoomId(match.bravoGroup.id),
		);

		expect(hasPermission(bravoRoom, "VIEW", { id: alphaUserIds[0] })).toBe(
			false,
		);
	});

	test("tournament organizer observes and may post into the match chat", async () => {
		const { chatRoomId, authorId } = await setupStartedTournamentMatch();

		const room = await resolveOrThrow(chatRoomId);

		expect(hasPermission(room, "OBSERVE", { id: authorId })).toBe(true);
		expect(hasPermission(room, "VIEW", { id: authorId })).toBe(true);
		expect(hasPermission(room, "POST", { id: authorId })).toBe(true);
	});

	test("participants lose view once the room closes; observers keep it", async () => {
		const { chatRoomId, authorId, teamAlphaUserIds } =
			await setupStartedTournamentMatch();
		await ChatRepository.closeExpiredRooms(addHours(new Date(), 100_000));

		const room = await resolveOrThrow(chatRoomId);

		expect(room.closedAt).not.toBeNull();
		expect(hasPermission(room, "VIEW", { id: teamAlphaUserIds[0] })).toBe(
			false,
		);
		expect(hasPermission(room, "VIEW", { id: authorId })).toBe(true);
		expect(hasPermission(room, "VIEW", { id: adminId() })).toBe(true);
	});
});

describe("ChatRoomResolver.permissionsOf", () => {
	const openRoom = {
		type: "SQ_MATCH" as const,
		expiresAt: dateToDatabaseTimestamp(addHours(new Date(), 1)),
		closedAt: null,
	};
	const expiredRoom = {
		...openRoom,
		expiresAt: dateToDatabaseTimestamp(addHours(new Date(), -1)),
	};

	test.each([
		{
			why: "participant of an open room",
			args: { room: openRoom, participantUserIds: [100], observerUserIds: [] },
			userId: 100,
			allowed: true,
		},
		{
			why: "non-participant",
			args: { room: openRoom, participantUserIds: [100], observerUserIds: [] },
			userId: 101,
			allowed: false,
		},
		{
			why: "expired room",
			args: {
				room: expiredRoom,
				participantUserIds: [100],
				observerUserIds: [],
			},
			userId: 100,
			allowed: false,
		},
		{
			why: "closed room",
			args: {
				room: { ...openRoom, closedAt: 1 },
				participantUserIds: [100],
				observerUserIds: [],
			},
			userId: 100,
			allowed: false,
		},
		{
			why: "observer of an open match room",
			args: {
				room: openRoom,
				participantUserIds: [100],
				observerUserIds: [101],
			},
			userId: 101,
			allowed: true,
		},
		{
			why: "observer of an expired match room",
			args: {
				room: expiredRoom,
				participantUserIds: [100],
				observerUserIds: [101],
			},
			userId: 101,
			allowed: false,
		},
		{
			why: "observer of a group chat (private team space)",
			args: {
				room: { ...openRoom, type: "SQ_GROUP" as const },
				participantUserIds: [100],
				observerUserIds: [101],
			},
			userId: 101,
			allowed: false,
		},
		{
			why: "observer of a team pickup chat (private team space)",
			args: {
				room: { ...openRoom, type: "TOURNAMENT_TEAM" as const },
				participantUserIds: [100],
				observerUserIds: [101],
			},
			userId: 101,
			allowed: false,
		},
	])("POST: $why -> $allowed", ({ args, userId, allowed }) => {
		expect(ChatRoomResolver.permissionsOf(args).POST.includes(userId)).toBe(
			allowed,
		);
	});
});

const resolveOrThrow = async (roomId: number) => {
	const room = await ChatRoomResolver.resolve(roomId);
	invariant(room, `room ${roomId} did not resolve`);

	return room;
};

const groupChatRoomId = async (groupId: number) => {
	const group = await db
		.selectFrom("Group")
		.select("Group.chatRoomId")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow();

	return group.chatRoomId!;
};

const teamChatRoomId = async (teamId: number) => {
	const team = await db
		.selectFrom("TournamentTeam")
		.select("TournamentTeam.chatRoomId")
		.where("TournamentTeam.id", "=", teamId)
		.executeTakeFirstOrThrow();

	return team.chatRoomId!;
};
