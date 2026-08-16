import { subMinutes } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import invariant from "~/utils/invariant";
import {
	FULL_GROUP_SIZE,
	SENDOUQ,
	SENDOUQ_LOOKING_ROOM,
	sqGroupWebsocketRoom,
} from "../q-constants";
import * as ReadyCheck from "./ready-check.server";
import { refreshSendouQInstance, SendouQ } from "./SendouQ.server";

const setupMatchedUpGroups = async () => {
	const ownMembers = await UserFactory.createMany(FULL_GROUP_SIZE);
	const theirMembers = await UserFactory.createMany(FULL_GROUP_SIZE);

	const theirGroup = await SQGroupFactory.create({
		memberUserIds: theirMembers.map((member) => member.id),
	});
	const ownGroup = await SQGroupFactory.create(
		{ memberUserIds: ownMembers.map((member) => member.id) },
		{ likedByGroupIds: [theirGroup.id] },
	);

	await refreshSendouQInstance();

	await ReadyCheck.start({
		ownGroup: SendouQ.findUncensoredGroupById(ownGroup.id)!,
		theirGroup: SendouQ.findUncensoredGroupById(theirGroup.id)!,
		actorUserId: ownMembers[0].id,
	});

	return { ownGroup, theirGroup, ownMembers, theirMembers };
};

const findReadyCheck = (groupId: number) =>
	SQGroupRepository.findReadyCheckByGroupId(groupId);

const findGroupStatus = async (groupId: number) => {
	const group = await db
		.selectFrom("Group")
		.select("Group.status")
		.where("Group.id", "=", groupId)
		.executeTakeFirstOrThrow();

	return group.status;
};

const findMatch = () =>
	db.selectFrom("GroupMatch").selectAll().executeTakeFirst();

/** Rooms every system message sent so far was broadcast to, in order. */
const broadcastedRooms = () =>
	vi
		.mocked(ChatSystemMessage.send)
		.mock.calls.flatMap(([msg]) => (Array.isArray(msg) ? msg : [msg]))
		.map((msg) => msg.room);

/** Confirms every member of both groups as ready, which is what creates the match. */
const confirmEveryoneReady = async (groupId: number) => {
	for (;;) {
		const readyCheck = await findReadyCheck(groupId);
		if (!readyCheck) return;

		const nextToConfirm = readyCheck.members.find(
			(member) => !member.confirmedAt,
		);
		invariant(nextToConfirm, "Everyone confirmed but no match was created");

		await ReadyCheck.confirm({ readyCheck, userId: nextToConfirm.userId });
	}
};

describe("SendouQ ready check", () => {
	let groups: Awaited<ReturnType<typeof setupMatchedUpGroups>>;

	beforeEach(async () => {
		groups = await setupMatchedUpGroups();
		vi.mocked(ChatSystemMessage.send).mockClear();
	});

	test("takes both groups out of the looking pool", async () => {
		expect(await findGroupStatus(groups.ownGroup.id)).toBe("READY_CHECK");
		expect(await findGroupStatus(groups.theirGroup.id)).toBe("READY_CHECK");
		expect(SendouQ.lookingGroups(groups.ownMembers[0].id)).toHaveLength(0);
	});

	test("counts the user who started it as ready", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);

		const confirmed = readyCheck!.members.filter(
			(member) => member.confirmedAt,
		);
		expect(confirmed).toHaveLength(1);
		expect(confirmed[0].userId).toBe(groups.ownMembers[0].id);
	});

	test("creates the match only once everyone has confirmed", async () => {
		const membersToConfirm = [
			...groups.ownMembers.slice(1),
			...groups.theirMembers,
		];

		for (const member of membersToConfirm.slice(0, -1)) {
			const readyCheck = await findReadyCheck(groups.ownGroup.id);
			invariant(readyCheck, "Ready check ended early");

			const matchId = await ReadyCheck.confirm({
				readyCheck,
				userId: member.id,
			});

			expect(matchId).toBeNull();
			expect(await findMatch()).toBeUndefined();
		}

		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck, "Ready check ended early");

		const matchId = await ReadyCheck.confirm({
			readyCheck,
			userId: membersToConfirm.at(-1)!.id,
		});

		const match = await findMatch();
		expect(match?.id).toBe(matchId);

		// the ready check is done and the groups are matched up
		expect(await findReadyCheck(groups.ownGroup.id)).toBeUndefined();
		expect(await findGroupStatus(groups.ownGroup.id)).toBe("ACTIVE");
		expect(await findGroupStatus(groups.theirGroup.id)).toBe("ACTIVE");
	});

	test("the last two confirming at the same time still creates the match", async () => {
		const membersToConfirm = [
			...groups.ownMembers.slice(1),
			...groups.theirMembers,
		];

		for (const member of membersToConfirm.slice(0, -2)) {
			const readyCheck = await findReadyCheck(groups.ownGroup.id);
			invariant(readyCheck, "Ready check ended early");

			await ReadyCheck.confirm({ readyCheck, userId: member.id });
		}

		// both of them read the state before either had confirmed, so neither one's
		// view of it shows the other as ready
		const staleReadyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(staleReadyCheck, "Ready check ended early");

		const [secondToLast, last] = membersToConfirm.slice(-2);

		expect(
			await ReadyCheck.confirm({
				readyCheck: staleReadyCheck,
				userId: secondToLast.id,
			}),
		).toBeNull();

		const matchId = await ReadyCheck.confirm({
			readyCheck: staleReadyCheck,
			userId: last.id,
		});

		expect(matchId).not.toBeNull();
		expect((await findMatch())?.id).toBe(matchId);
	});

	test("confirming a ready check that already ended does nothing", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await ReadyCheck.expire(readyCheck);

		expect(
			await ReadyCheck.confirm({ readyCheck, userId: groups.ownMembers[1].id }),
		).toBeNull();
		expect(await findMatch()).toBeUndefined();
	});

	test("a confirmation revalidates only the two groups, expiring also the looking pool", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await ReadyCheck.confirm({ readyCheck, userId: groups.ownMembers[1].id });

		// the looking pool is unchanged while the ready check runs, so it is left alone
		expect(broadcastedRooms()).toEqual([
			sqGroupWebsocketRoom(groups.ownGroup.id),
			sqGroupWebsocketRoom(groups.theirGroup.id),
		]);

		await ReadyCheck.expire(readyCheck);

		expect(broadcastedRooms()).toContain(SENDOUQ_LOOKING_ROOM);
	});

	test("expiring sends both groups back to looking and marks who missed it", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await ReadyCheck.confirm({ readyCheck, userId: groups.ownMembers[1].id });

		await ReadyCheck.expire(readyCheck);

		expect(await findMatch()).toBeUndefined();
		expect(await findReadyCheck(groups.ownGroup.id)).toBeUndefined();
		expect(await findGroupStatus(groups.ownGroup.id)).toBe("ACTIVE");
		expect(await findGroupStatus(groups.theirGroup.id)).toBe("ACTIVE");

		const kickable =
			await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
				groups.ownGroup.id,
			);

		// the two who confirmed are not kickable, the two who didn't are
		expect(kickable.sort()).toEqual(
			[groups.ownMembers[2].id, groups.ownMembers[3].id].sort(),
		);
	});

	test("the challenge is gone after expiring, so the groups have to match up again", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await ReadyCheck.expire(readyCheck);

		const likes = await SQGroupRepository.findAllLikesByGroupId(
			groups.ownGroup.id,
		);
		expect(likes.given).toHaveLength(0);
		expect(likes.received).toHaveLength(0);
	});

	test("a new ready check gives everyone a fresh chance to show up", async () => {
		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await ReadyCheck.expire(readyCheck);
		await refreshSendouQInstance();

		await ReadyCheck.start({
			ownGroup: SendouQ.findUncensoredGroupById(groups.ownGroup.id)!,
			theirGroup: SendouQ.findUncensoredGroupById(groups.theirGroup.id)!,
			actorUserId: groups.ownMembers[0].id,
		});

		expect(
			await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
				groups.ownGroup.id,
			),
		).toHaveLength(0);
	});

	test("getting into a match clears who missed the previous check", async () => {
		const firstCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(firstCheck);

		await ReadyCheck.expire(firstCheck);
		await refreshSendouQInstance();

		// nobody was kicked, the same groups match up again and all show up
		await ReadyCheck.start({
			ownGroup: SendouQ.findUncensoredGroupById(groups.ownGroup.id)!,
			theirGroup: SendouQ.findUncensoredGroupById(groups.theirGroup.id)!,
			actorUserId: groups.ownMembers[0].id,
		});
		await confirmEveryoneReady(groups.ownGroup.id);

		expect(await findMatch()).toBeDefined();

		for (const groupId of [groups.ownGroup.id, groups.theirGroup.id]) {
			expect(
				await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
					groupId,
				),
			).toHaveLength(0);
		}
	});

	test("leaving the group calls the ready check off for both groups", async () => {
		const { abortedReadyCheckGroupIds } = await SQGroupRepository.leaveGroup(
			groups.theirMembers[0].id,
		);

		expect(abortedReadyCheckGroupIds.sort()).toEqual(
			[groups.ownGroup.id, groups.theirGroup.id].sort(),
		);
		expect(await findReadyCheck(groups.ownGroup.id)).toBeUndefined();
		expect(await findGroupStatus(groups.ownGroup.id)).toBe("ACTIVE");
		expect(await findGroupStatus(groups.theirGroup.id)).toBe("ACTIVE");

		// nobody is blamed for a ready check that was called off
		expect(
			await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
				groups.ownGroup.id,
			),
		).toHaveLength(0);
	});

	test("a ready check that ran its course is found as expired", async () => {
		expect(
			await SQGroupRepository.findAllReadyChecksStartedBefore(
				subMinutes(new Date(), SENDOUQ.READY_CHECK_MINUTES),
			),
		).toHaveLength(0);

		const readyCheck = await findReadyCheck(groups.ownGroup.id);
		invariant(readyCheck);

		await backdate("GroupReadyCheck", readyCheck.id, {
			createdAt: subMinutes(new Date(), SENDOUQ.READY_CHECK_MINUTES + 1),
		});

		expect(
			await SQGroupRepository.findAllReadyChecksStartedBefore(
				subMinutes(new Date(), SENDOUQ.READY_CHECK_MINUTES),
			),
		).toHaveLength(1);
		expect(ReadyCheck.hasExpired({ ...readyCheck, createdAt: 0 })).toBe(true);
	});
});
