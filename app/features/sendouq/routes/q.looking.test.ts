import { describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
}));

import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { UserMapModePreferences } from "~/db/tables-json";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { wrappedAction } from "~/utils/Test";
import * as ReadyCheck from "../core/ready-check.server";
import { refreshSendouQInstance } from "../core/SendouQ.server";
import type { lookingSchema } from "../q-action-schemas";
import { FULL_GROUP_SIZE } from "../q-constants";
import { action as rawLookingAction } from "./q.looking";

const SZ_ONLY_PREFERENCE: UserMapModePreferences["modes"] = [
	{ mode: "SZ", preference: "PREFER" },
	{ mode: "TC", preference: "AVOID" },
	{ mode: "RM", preference: "AVOID" },
	{ mode: "CB", preference: "AVOID" },
];

const prepareGroups = async () => {
	const owner = await UserFactory.createAdmin(null, {
		matchProfile: {
			mapModePreferences: {
				modes: SZ_ONLY_PREFERENCE,
				pool: [{ mode: "SZ", stages: [...stageIds].slice(0, 7) }],
			},
		},
	});
	const ownMembers = await UserFactory.createMany(FULL_GROUP_SIZE - 1);

	const theirOwner = await UserFactory.create(null, {
		matchProfile: {
			mapModePreferences: {
				modes: SZ_ONLY_PREFERENCE,
				pool: [
					{
						mode: "SZ",
						stages: [...stageIds].slice(0, 20).reverse().slice(0, 7),
					},
				],
			},
		},
	});
	const theirMembers = await UserFactory.createMany(FULL_GROUP_SIZE - 1);

	const theirGroup = await SQGroupFactory.create({
		memberUserIds: [theirOwner.id, ...theirMembers.map((user) => user.id)],
	});
	const ownGroup = await SQGroupFactory.create(
		{ memberUserIds: [owner.id, ...ownMembers.map((user) => user.id)] },
		{ likedByGroupIds: [theirGroup.id] },
	);

	return { owner, ownGroup, theirGroup, teammate: ownMembers[0] };
};

const lookingAction = wrappedAction<typeof lookingSchema>({
	action: rawLookingAction,
});

/** Confirms every member of both groups as ready, which is what creates the match. */
const confirmEveryoneReady = async (groupId: number) => {
	for (;;) {
		const readyCheck = await SQGroupRepository.findReadyCheckByGroupId(groupId);
		if (!readyCheck) return;

		const nextToConfirm = readyCheck.members.find(
			(member) => !member.confirmedAt,
		);
		invariant(nextToConfirm, "Everyone confirmed but no match was created");

		await ReadyCheck.confirm({ readyCheck, userId: nextToConfirm.userId });
	}
};

describe("SendouQ match creation validation", () => {
	test("doesn't create a match with a group that hasn't challenged us", async () => {
		const owner = await UserFactory.createAdmin();
		const ownMembers = await UserFactory.createMany(FULL_GROUP_SIZE - 1);
		const theirMembers = await UserFactory.createMany(FULL_GROUP_SIZE);

		const theirGroup = await SQGroupFactory.create({
			memberUserIds: theirMembers.map((user) => user.id),
		});
		await SQGroupFactory.create({
			memberUserIds: [owner.id, ...ownMembers.map((user) => user.id)],
		});
		await refreshSendouQInstance();

		await lookingAction(
			{
				_action: "MATCH_UP",
				targetGroupId: theirGroup.id,
			},
			{ user: "admin" },
		);

		const matches = await db.selectFrom("GroupMatch").selectAll().execute();
		expect(matches).toHaveLength(0);
	});

	test("doesn't create a rated match after the season has ended", async () => {
		const groups = await prepareGroups();

		const season = Seasons.currentOrPrevious()!;
		vi.useFakeTimers();
		try {
			// both groups were queueing when the season ended a moment ago
			vi.setSystemTime(new Date(season.ends.getTime() + 10 * 60 * 1000));
			// biome-ignore lint/plugin: no production write reaches this state, it is produced by time passing while the group idles in the queue
			await db
				.updateTable("Group")
				.set({ latestActionAt: dateToDatabaseTimestamp(new Date()) })
				.execute();
			await refreshSendouQInstance();

			await lookingAction(
				{
					_action: "MATCH_UP",
					targetGroupId: groups.theirGroup.id,
				},
				{ user: "admin" },
			).catch(() => undefined);
			await confirmEveryoneReady(groups.ownGroup.id);

			const matches = await db.selectFrom("GroupMatch").selectAll().execute();
			expect(matches).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
