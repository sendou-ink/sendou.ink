import type { SerializeFrom } from "@remix-run/server-runtime";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { UserMapModePreferences } from "~/db/tables";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import { stageIds } from "~/modules/in-game-lists";
import {
	dbInsertUsers,
	dbReset,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import invariant from "~/utils/invariant";
import type { lookingSchema, matchSchema } from "../q-schemas.server";
import { loader, action as rawLookingAction } from "./q.looking";
import { action as rawMatchAction } from "./q.match.$id";

const createGroup = async (userIds: number[]) => {
	const group = await db
		.insertInto("Group")
		.values({
			inviteCode: "1234",
			status: "ACTIVE",
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await db
		.insertInto("GroupMember")
		.values(
			userIds.map((userId, i) => ({
				groupId: group.id,
				userId,
				role: i === 0 ? "OWNER" : "REGULAR",
			})),
		)
		.execute();
};

const SZ_ONLY_PREFERENCE: UserMapModePreferences["modes"] = [
	{ mode: "SZ", preference: "PREFER" },
	{ mode: "TC", preference: "AVOID" },
	{ mode: "RM", preference: "AVOID" },
	{ mode: "CB", preference: "AVOID" },
];

const prepareGroups = async () => {
	await dbInsertUsers(8);
	await createGroup([1, 2, 3, 4]);
	await createGroup([5, 6, 7, 8]);
	await db
		.insertInto("GroupLike")
		.values({ likerGroupId: 2, targetGroupId: 1 })
		.execute();

	await insertMapModePreferences(1, {
		modes: SZ_ONLY_PREFERENCE,
		pool: [{ mode: "SZ", stages: [...stageIds].slice(0, 7) }],
	});

	await insertMapModePreferences(5, {
		modes: SZ_ONLY_PREFERENCE,
		pool: [
			{ mode: "SZ", stages: [...stageIds].slice(0, 20).reverse().slice(0, 7) },
		],
	});
};

const insertMapModePreferences = (
	userId: number,
	preferences: UserMapModePreferences,
) => {
	return db
		.updateTable("User")
		.set({
			mapModePreferences: JSON.stringify(preferences),
		})
		.where("User.id", "=", userId)
		.execute();
};

const lookingAction = wrappedAction<typeof lookingSchema>({
	action: rawLookingAction,
});

const createMatch = () =>
	lookingAction(
		{
			_action: "MATCH_UP",
			targetGroupId: 2,
		},
		{ user: "admin" },
	);

const findMatch = () =>
	db
		.selectFrom("GroupMatch")
		.selectAll()
		.where("id", "=", 1)
		.executeTakeFirstOrThrow();

describe("SendouQ match creation", () => {
	beforeEach(async () => {
		await prepareGroups();
	});

	afterEach(() => {
		dbReset();
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
		await insertMapModePreferences(1, {
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
			pools.find((p) => p.userId === 1)!.pool.every((p) => p.mode !== "SZ"),
		).toBe(true);
	});

	test("adds mode preferences to memento", async () => {
		await createMatch();

		const match = await findMatch();

		const modePreferences = match.memento?.modePreferences;

		expect(modePreferences?.SZ?.length).toBe(2);
	});

	test("adds mode preferences to memento including neutral", async () => {
		await insertMapModePreferences(2, {
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

describe("Private user note sorting", () => {
	beforeEach(async () => {
		await dbInsertUsers(8);

		await createGroup([1]);
		await createGroup([2]);
		await createGroup([3]);
		await createGroup([4]);
		await createGroup([5]);
		await createGroup([6, 7]);
		await createGroup([8]);

		await db
			.insertInto("GroupMatch")
			.values({ alphaGroupId: 2, bravoGroupId: 3 })
			.execute();
	});

	afterEach(() => {
		dbReset();
	});

	const lookingLoader = wrappedLoader<SerializeFrom<typeof loader>>({
		loader,
	});
	const matchAction = wrappedAction<typeof matchSchema>({
		action: rawMatchAction,
	});

	const matchActionParams = { id: "1" };

	test("users with positive note sorted first", async () => {
		await matchAction(
			{
				_action: "ADD_PRIVATE_USER_NOTE",
				targetId: 5,
				sentiment: "POSITIVE",
				comment: "test",
			},
			{ user: "admin", params: matchActionParams },
		);

		const data = await lookingLoader({ user: "admin" });

		expect(data.groups.neutral[0].members![0].id).toBe(5);
	});

	test("users with negative note sorted last", async () => {
		await matchAction(
			{
				_action: "ADD_PRIVATE_USER_NOTE",
				targetId: 5,
				sentiment: "NEGATIVE",
				comment: "test",
			},
			{ user: "admin", params: matchActionParams },
		);

		const data = await lookingLoader({ user: "admin" });

		expect(
			data.groups.neutral[data.groups.neutral.length - 1].members![0].id,
		).toBe(5);
	});

	test("group with both negative and positive sentiment sorted last", async () => {
		await matchAction(
			{
				_action: "ADD_PRIVATE_USER_NOTE",
				targetId: 6,
				sentiment: "POSITIVE",
				comment: "test",
			},
			{ user: "admin", params: matchActionParams },
		);
		await matchAction(
			{
				_action: "ADD_PRIVATE_USER_NOTE",
				targetId: 7,
				sentiment: "NEGATIVE",
				comment: "test",
			},
			{ user: "admin", params: matchActionParams },
		);

		const data = await lookingLoader({ user: "admin" });

		expect(
			data.groups.neutral[data.groups.neutral.length - 1].members?.some(
				(m) => m.id === 6,
			),
		).toBe(true);
	});
});
