import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as FriendshipFactory from "~/db/seed/factories/FriendshipFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { withNoUser, withUserId } from "~/utils/Test";
import * as AssociationRepository from "./AssociationRepository.server";
import type { AssociationVisibility } from "./associations-types";

const users = UserFactory.pool();

const ownerId = () => users.id(1);
const viewerId = () => users.id(2);

const passed = () => dateToDatabaseTimestamp(sub(new Date(), { days: 1 }));
const upcoming = () => dateToDatabaseTimestamp(add(new Date(), { days: 1 }));

/** Scrim posts are the content with a visibility; the post's owner owns it. */
async function contentVisibleTo(
	visibility: AssociationVisibility | null,
	viewer: number | null,
) {
	await ScrimPostFactory.create({
		users: [{ userId: ownerId(), isOwner: true }],
		visibility,
	});

	const query = () =>
		db
			.selectFrom("ScrimPost")
			.select((eb) =>
				AssociationRepository.isVisibleToActor(eb, {
					visibility: eb.ref("ScrimPost.visibility"),
					contentOwnerId: eb.val(ownerId()),
				}).as("visible"),
			)
			.executeTakeFirstOrThrow();

	const row = await (viewer === null
		? withNoUser(query)
		: withUserId(viewer, query));

	return Boolean(row.visible);
}

describe("AssociationRepository.isVisibleToActor", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const viewersAssociation = () =>
		AssociationFactory.create(
			{ userId: ownerId() },
			{ memberUserIds: [viewerId()] },
		);

	test("public content is visible to anonymous visitors", async () => {
		expect(await contentVisibleTo(null, null)).toBe(true);
	});

	test("an association's content is visible to its members", async () => {
		const association = await viewersAssociation();

		expect(
			await contentVisibleTo({ forAssociation: association.id }, viewerId()),
		).toBe(true);
	});

	test("an association's content is hidden from non-members", async () => {
		const association = await AssociationFactory.create({ userId: ownerId() });

		expect(
			await contentVisibleTo({ forAssociation: association.id }, viewerId()),
		).toBe(false);
	});

	test("an association's content is hidden from anonymous visitors", async () => {
		const association = await viewersAssociation();

		expect(
			await contentVisibleTo({ forAssociation: association.id }, null),
		).toBe(false);
	});

	test.each([
		{ why: "same tier", tier: 2, expected: true },
		{ why: "better tier", tier: 1, expected: true },
		{ why: "worse tier", tier: 3, expected: false },
		{ why: "no tier", tier: null, expected: false },
	])("plus server content shown to +2: $why", async ({ tier, expected }) => {
		if (tier !== null) await UserFactory.grant(viewerId(), { plusTier: tier });

		expect(await contentVisibleTo({ forAssociation: "+2" }, viewerId())).toBe(
			expected,
		);
	});

	test("friends' content is visible to a friend of the owner", async () => {
		await FriendshipFactory.create({
			userOneId: viewerId(),
			userTwoId: ownerId(),
		});

		expect(
			await contentVisibleTo({ forAssociation: "FRIENDS" }, viewerId()),
		).toBe(true);
	});

	test("friends' content is hidden from others", async () => {
		expect(
			await contentVisibleTo({ forAssociation: "FRIENDS" }, viewerId()),
		).toBe(false);
	});

	test("content is shown to the next association once its time has come", async () => {
		const association = await viewersAssociation();

		expect(
			await contentVisibleTo(
				{
					forAssociation: "+1",
					notFoundInstructions: [
						{ at: passed(), forAssociation: association.id },
					],
				},
				viewerId(),
			),
		).toBe(true);
	});

	test("content is not shown to the next association before its time", async () => {
		const association = await viewersAssociation();

		expect(
			await contentVisibleTo(
				{
					forAssociation: "+1",
					notFoundInstructions: [
						{ at: upcoming(), forAssociation: association.id },
					],
				},
				viewerId(),
			),
		).toBe(false);
	});

	test("content that has gone public is visible to anonymous visitors", async () => {
		expect(
			await contentVisibleTo(
				{
					forAssociation: "FRIENDS",
					notFoundInstructions: [{ at: passed(), forAssociation: null }],
				},
				null,
			),
		).toBe(true);
	});
});

describe("AssociationRepository.isPublic", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test.each([
		{ why: "no visibility", visibility: null, expected: true },
		{
			why: "shown to an association",
			visibility: { forAssociation: "+1" as const },
			expected: false,
		},
		{
			why: "gone public",
			visibility: {
				forAssociation: "+1" as const,
				notFoundInstructions: [{ at: passed(), forAssociation: null }],
			},
			expected: true,
		},
		{
			why: "going public later",
			visibility: {
				forAssociation: "+1" as const,
				notFoundInstructions: [{ at: upcoming(), forAssociation: null }],
			},
			expected: false,
		},
	])("$why", async ({ visibility, expected }) => {
		await ScrimPostFactory.create({
			users: [{ userId: ownerId(), isOwner: true }],
			visibility,
		});

		const row = await db
			.selectFrom("ScrimPost")
			.select((eb) =>
				AssociationRepository.isPublic(eb, eb.ref("ScrimPost.visibility")).as(
					"public",
				),
			)
			.executeTakeFirstOrThrow();

		expect(Boolean(row.public)).toBe(expected);
	});
});

describe("AssociationRepository.mentionsAssociation", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test.each([
		{ why: "no visibility", visibility: () => null, expected: false },
		{
			why: "current association",
			visibility: (id: number) => ({ forAssociation: id }),
			expected: true,
		},
		{
			why: "virtual association",
			visibility: () => ({ forAssociation: "+1" as const }),
			expected: false,
		},
		{
			why: "association later in the schedule",
			visibility: (id: number) => ({
				forAssociation: "+1" as const,
				notFoundInstructions: [{ at: upcoming(), forAssociation: id }],
			}),
			expected: true,
		},
		{
			why: "schedule going public only",
			visibility: () => ({
				forAssociation: "+1" as const,
				notFoundInstructions: [{ at: upcoming(), forAssociation: null }],
			}),
			expected: false,
		},
	])("$why", async ({ visibility, expected }) => {
		const association = await AssociationFactory.create({ userId: ownerId() });
		await ScrimPostFactory.create({
			users: [{ userId: ownerId(), isOwner: true }],
			visibility: visibility(association.id),
		});

		const row = await db
			.selectFrom("ScrimPost")
			.select((eb) =>
				AssociationRepository.mentionsAssociation(eb, {
					visibility: eb.ref("ScrimPost.visibility"),
					associationId: association.id,
				}).as("mentions"),
			)
			.executeTakeFirstOrThrow();

		expect(Boolean(row.mentions)).toBe(expected);
	});
});
