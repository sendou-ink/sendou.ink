import { subMinutes } from "date-fns";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import { backdate } from "~/db/seed/core/backdate";
import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Seasons from "~/features/mmr/core/Seasons";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import invariant from "~/utils/invariant";
import { wrappedAction, wrappedLoader } from "~/utils/Test";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import * as ReadyCheck from "../core/ready-check.server";
import { refreshSendouQInstance, SendouQ } from "../core/SendouQ.server";
import type { readySchema } from "../q-action-schemas";
import { FULL_GROUP_SIZE, SENDOUQ } from "../q-constants";
import { action as rawReadyAction, loader as rawReadyLoader } from "./q.ready";

const readyLoader = wrappedLoader<Awaited<ReturnType<typeof rawReadyLoader>>>({
	loader: rawReadyLoader,
});

const readyAction = wrappedAction<typeof readySchema>({
	action: rawReadyAction,
});

const setupReadyCheck = async () => {
	const admin = await UserFactory.createAdmin();
	const ownMembers = await UserFactory.createMany(FULL_GROUP_SIZE - 1);
	const theirMembers = await UserFactory.createMany(FULL_GROUP_SIZE);

	const theirGroup = await SQGroupFactory.create({
		memberUserIds: theirMembers.map((member) => member.id),
	});
	const ownGroup = await SQGroupFactory.create(
		{ memberUserIds: [admin.id, ...ownMembers.map((member) => member.id)] },
		{ likedByGroupIds: [theirGroup.id] },
	);

	await refreshSendouQInstance();

	await ReadyCheck.start({
		ownGroup: SendouQ.findUncensoredGroupById(ownGroup.id)!,
		theirGroup: SendouQ.findUncensoredGroupById(theirGroup.id)!,
		actorUserId: admin.id,
	});

	return { admin, ownGroup, ownMembers, theirGroup, theirMembers };
};

describe("SendouQ ready check page", () => {
	afterEach(() => {
		Seasons.DANGEROUS_setSeasonEndedOverride(false);
	});

	test("doesn't reveal who the opponents are", async () => {
		const { theirGroup, theirMembers } = await setupReadyCheck();

		// one of them readies up, so that their id would have something to ride along with
		const readyCheck = await SQGroupRepository.findReadyCheckByGroupId(
			theirGroup.id,
		);
		invariant(readyCheck);
		await ReadyCheck.confirm({ readyCheck, userId: theirMembers[0].id });

		const data = await readyLoader({ user: "admin" });

		// all they are is a count of anonymous members
		expect(data.theirGroup).toEqual({
			memberCount: FULL_GROUP_SIZE,
			readyCount: 1,
		});
		// so that a field carrying more about them can't be added unnoticed
		expect(Object.keys(data).sort()).toEqual([
			"expiresAt",
			"group",
			"readyUserIds",
			"theirGroup",
			"userCards",
		]);

		const shownUserIds = [
			...data.group.members.map((member) => member.id),
			...data.readyUserIds,
			...data.userCards.keys(),
		];
		for (const member of theirMembers) {
			expect(shownUserIds).not.toContain(member.id);
		}
	});

	test("shows which of the own group's members are ready", async () => {
		const { admin } = await setupReadyCheck();

		const data = await readyLoader({ user: "admin" });

		// starting the ready check counted as being ready
		expect(data.readyUserIds).toEqual([admin.id]);
	});

	test("readying up after it ran out of time sends the group back to looking", async () => {
		const { ownGroup, ownMembers } = await setupReadyCheck();

		const readyCheck = await SQGroupRepository.findReadyCheckByGroupId(
			ownGroup.id,
		);
		invariant(readyCheck);
		await backdate("GroupReadyCheck", readyCheck.id, {
			createdAt: subMinutes(new Date(), SENDOUQ.READY_CHECK_MINUTES + 1),
		});

		const response = await readyAction(
			{ _action: "CONFIRM_READY" },
			{ user: "admin" },
		);

		expect(response.headers.get("Location")).toBe(SENDOUQ_LOOKING_PAGE);
		// the check is over, not confirmed
		expect(
			await SQGroupRepository.findReadyCheckByGroupId(ownGroup.id),
		).toBeUndefined();
		expect(
			await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
				ownGroup.id,
			),
		).toEqual(ownMembers.map((member) => member.id));
	});

	test("the season ending mid check ends it with nobody marked as having missed it", async () => {
		const { ownGroup, theirGroup } = await setupReadyCheck();

		Seasons.DANGEROUS_setSeasonEndedOverride(true);

		// out of the queue and off to the front page
		await expect(readyLoader({ user: "admin" })).rejects.toThrow("302");

		expect(
			await SQGroupRepository.findReadyCheckByGroupId(ownGroup.id),
		).toBeUndefined();
		for (const group of [ownGroup, theirGroup]) {
			expect(
				await SQGroupRepository.findAllMissedReadyCheckUserIdsByGroupId(
					group.id,
				),
			).toEqual([]);
		}
	});
});
