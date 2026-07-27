import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	removeRoom: vi.fn(),
	setMetadata: vi.fn(),
}));

import * as SQGroupFactory from "~/db/seed/factories/SQGroupFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { UserMapModePreferences } from "~/db/tables-json";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import invariant from "~/utils/invariant";
import { dbReset, withUserId, wrappedAction } from "~/utils/Test";
import { refreshSendouQInstance } from "../core/SendouQ.server";
import { FULL_GROUP_SIZE } from "../q-constants";
import type { lookingSchema } from "../q-schemas.server";
import * as SQGroupRepository from "../SQGroupRepository.server";
import { action as rawLookingAction } from "./q.looking";

const SZ_ONLY_PREFERENCE: UserMapModePreferences["modes"] = [
	{ mode: "SZ", preference: "PREFER" },
	{ mode: "TC", preference: "AVOID" },
	{ mode: "RM", preference: "AVOID" },
	{ mode: "CB", preference: "AVOID" },
];

const prepareGroups = async () => {
	const owner = await UserFactory.createAdmin();
	const others = await UserFactory.createMany(FULL_GROUP_SIZE * 2 - 1);

	const ownGroup = await SQGroupFactory.create({
		userId: owner.id,
		additionalMemberUserIds: others
			.slice(0, FULL_GROUP_SIZE - 1)
			.map((user) => user.id),
	});

	const [theirOwner, ...theirMembers] = others.slice(FULL_GROUP_SIZE - 1);
	const theirGroup = await SQGroupFactory.create({
		userId: theirOwner.id,
		additionalMemberUserIds: theirMembers.map((user) => user.id),
	});

	await SQGroupRepository.insertLike({
		likerGroupId: theirGroup.id,
		targetGroupId: ownGroup.id,
	});

	await setMapModePreferences(owner.id, {
		modes: SZ_ONLY_PREFERENCE,
		pool: [{ mode: "SZ", stages: [...stageIds].slice(0, 7) }],
	});

	await setMapModePreferences(theirOwner.id, {
		modes: SZ_ONLY_PREFERENCE,
		pool: [
			{ mode: "SZ", stages: [...stageIds].slice(0, 20).reverse().slice(0, 7) },
		],
	});

	return { owner, ownGroup, theirGroup, teammate: others[0] };
};

const setMapModePreferences = (
	userId: number,
	mapModePreferences: UserMapModePreferences,
) =>
	withUserId(userId, () =>
		MatchProfileRepository.updateOwnMatchProfile({
			mapModePreferences,
			vc: "NO",
			languages: [],
			weaponPool: [],
			noScreen: 0,
		}),
	);

const lookingAction = wrappedAction<typeof lookingSchema>({
	action: rawLookingAction,
});

const findMatch = () =>
	db.selectFrom("GroupMatch").selectAll().executeTakeFirstOrThrow();

describe("SendouQ match creation", () => {
	let groups: Awaited<ReturnType<typeof prepareGroups>>;

	const createMatch = () =>
		lookingAction(
			{
				_action: "MATCH_UP",
				targetGroupId: groups.theirGroup.id,
			},
			{ user: "admin" },
		);

	beforeEach(async () => {
		groups = await prepareGroups();
		await refreshSendouQInstance();
	});

	afterEach(async () => {
		await dbReset();
	});

	test("adds pools to memento", async () => {
		await createMatch();

		const match = await findMatch();
		const pools = match.memento?.pools;

		invariant(pools, "pools missing");

		expect(pools.length).toBe(2);
		expect(pools.some((p) => p.pool[0].stages.includes(1))).toBe(true);
		expect(pools.some((p) => p.pool[0].stages.includes(19))).toBe(true);
	});

	test("doesn't add pool where mode is avoided", async () => {
		await setMapModePreferences(groups.owner.id, {
			modes: [
				{ mode: "SZ", preference: "AVOID" },
				{ mode: "TC", preference: "PREFER" },
			],
			pool: [
				{
					mode: "TC",
					stages: [...stageIds]
						.filter((stageId) => !BANNED_MAPS.TC.includes(stageId))
						.slice(0, 7),
				},
			],
		});

		await createMatch();

		const match = await findMatch();
		const pools = match.memento?.pools;

		invariant(pools, "pools missing");

		expect(pools.length).toBe(2);
		expect(
			pools
				.find((p) => p.userId === groups.owner.id)!
				.pool.every((p) => p.mode !== "SZ"),
		).toBe(true);
	});

	test("adds mode preferences to memento", async () => {
		await createMatch();

		const match = await findMatch();

		const modePreferences = match.memento?.modePreferences;

		expect(modePreferences?.SZ?.length).toBe(2);
	});

	test("adds mode preferences to memento including neutral", async () => {
		await setMapModePreferences(groups.teammate.id, {
			modes: [{ mode: "TC", preference: "PREFER" }],
			pool: [],
		});

		await createMatch();

		const match = await findMatch();

		const modePreferences = match.memento?.modePreferences;

		expect(modePreferences?.SZ?.length).toBe(3);
		expect(modePreferences?.SZ?.some((p) => !p.preference)).toBe(true);
	});
});
