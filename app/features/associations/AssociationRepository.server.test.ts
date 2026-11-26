import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as LobbyFactory from "~/db/seed/factories/LobbyFactory";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { LimitReachedError } from "~/utils/errors";
import * as AssociationRepository from "./AssociationRepository.server";
import { ASSOCIATION } from "./associations-constants";

const users = UserFactory.pool();
const adminId = () => users.id(1);
const managerId = () => users.id(2);
const memberId = () => users.id(3);
const posterId = () => users.id(4);
const bookerId = () => users.id(5);

const hoursFromNow = (hours: number) =>
	dateToDatabaseTimestamp(add(new Date(), { hours }));

describe("findById", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("the admin manages, the admin and starred members share the invite link", async () => {
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [managerId()], memberUserIds: [memberId()] },
		);

		const association = await AssociationRepository.findById(id);

		expect(association?.permissions).toEqual({
			MANAGE: [adminId()],
			MANAGE_INVITE_LINK: [adminId(), managerId()],
		});
	});

	test("members list who can remove them", async () => {
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [managerId()], memberUserIds: [memberId()] },
		);

		const association = await AssociationRepository.findById(id);
		const removerIdsOf = (userId: number) =>
			association?.members.find((member) => member.id === userId)?.permissions
				.REMOVE;

		expect(removerIdsOf(adminId())).toEqual([]);
		expect(removerIdsOf(managerId())).toEqual([adminId()]);
		expect(removerIdsOf(memberId())).toEqual([adminId(), managerId()]);
	});

	test("returns null for an unknown id", async () => {
		expect(await AssociationRepository.findById(9999)).toBeNull();
	});
});

describe("findVisibilityOptionsByUserId", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("lists the user's associations and their Plus tier audiences", async () => {
		await UserFactory.grant(memberId(), { plusTier: 2 });
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);
		await AssociationFactory.create({ userId: adminId() });

		const result = await AssociationRepository.findVisibilityOptionsByUserId(
			memberId(),
		);

		expect(result.actual.map((association) => association.id)).toEqual([id]);
		expect(result.virtual).toEqual(["FRIENDS", "+2", "+3"]);
	});
});

describe("findByInviteCode", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("a reset code no longer finds the association", async () => {
		const { id } = await AssociationFactory.create({ userId: adminId() });
		const oldCode = await AssociationRepository.findInviteCodeById(id);

		await AssociationRepository.refreshInviteCode(id);
		const newCode = await AssociationRepository.findInviteCodeById(id);

		expect(
			await AssociationRepository.findByInviteCode(oldCode),
		).toBeUndefined();
		expect((await AssociationRepository.findByInviteCode(newCode))?.id).toBe(
			id,
		);
	});
});

describe("insert", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("makes the creator the admin", async () => {
		const { id } = await AssociationRepository.insert({
			name: "Night owls",
			userId: adminId(),
		});

		const association = await AssociationRepository.findById(id);

		expect(association?.members).toEqual([
			expect.objectContaining({ id: adminId(), role: "ADMIN" }),
		]);
	});

	test("throws past the membership limit, making nothing", async () => {
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: adminId() });
		}

		await expect(
			AssociationRepository.insert({ name: "One too many", userId: adminId() }),
		).rejects.toThrow(LimitReachedError);

		const actual = await AssociationRepository.findAllByMemberUserId(adminId());
		expect(actual).toHaveLength(ASSOCIATION.MAX_COUNT_REGULAR_USER);
	});

	test("lets a supporter past the regular limit", async () => {
		await UserFactory.grant(adminId(), { patronTier: 2 });
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: adminId() });
		}

		await AssociationRepository.insert({ name: "One more", userId: adminId() });

		const actual = await AssociationRepository.findAllByMemberUserId(adminId());
		expect(actual).toHaveLength(ASSOCIATION.MAX_COUNT_REGULAR_USER + 1);
	});
});

describe("deleteMember", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("promotes the new admin in place of the leaving one", async () => {
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [managerId()] },
		);

		await AssociationRepository.deleteMember({
			associationId: id,
			userId: adminId(),
			newAdminUserId: managerId(),
		});

		const association = await AssociationRepository.findById(id);
		expect(association?.members).toEqual([
			expect.objectContaining({ id: managerId(), role: "ADMIN" }),
		]);
	});

	test("a regular member leaving changes no roles", async () => {
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);

		await AssociationRepository.deleteMember({
			associationId: id,
			userId: memberId(),
		});

		const association = await AssociationRepository.findById(id);
		expect(association?.members).toEqual([
			expect.objectContaining({ id: adminId(), role: "ADMIN" }),
		]);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("the association is gone from its members' list", async () => {
		const { id } = await AssociationFactory.create({ userId: adminId() });

		await AssociationRepository.deleteById(id);

		const actual = await AssociationRepository.findAllByMemberUserId(adminId());
		expect(actual).toEqual([]);
	});

	test.each<{
		why: string;
		createContent: (associationId: number) => Promise<unknown>;
	}>([
		{
			why: "an upcoming scrim post is limited to it",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: posterId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "a scrim post is limited to it only if not found",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: posterId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: {
						forAssociation: "+1",
						notFoundInstructions: [
							{ at: hoursFromNow(0.5), forAssociation: associationId },
						],
					},
				}),
		},
		{
			why: "a scrim post that started within the listing window is limited to it",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: posterId(), isOwner: 1 }],
					startsAt: hoursFromNow(-1),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "an open lobby is limited to it",
			createContent: (associationId) =>
				LobbyFactory.create({
					hostUserId: posterId(),
					visibility: { forAssociation: associationId },
				}),
		},
	])("refuses while $why", async ({ createContent }) => {
		const association = await AssociationFactory.create({ userId: adminId() });
		await createContent(association.id);

		const isDeleted = await AssociationRepository.deleteById(association.id);

		expect(isDeleted).toBe(false);
		expect(await AssociationRepository.findById(association.id)).not.toBeNull();
	});

	test.each<{
		why: string;
		createContent: (associationId: number) => Promise<unknown>;
	}>([
		{ why: "no content is limited to it", createContent: async () => {} },
		{
			why: "the scrim post limited to it is no longer listed",
			createContent: (associationId) =>
				ScrimPostFactory.create({
					users: [{ userId: posterId(), isOwner: 1 }],
					startsAt: dateToDatabaseTimestamp(sub(new Date(), { hours: 4 })),
					visibility: { forAssociation: associationId },
				}),
		},
		{
			why: "the scrim post limited to it is booked",
			createContent: (associationId) =>
				ScrimPostFactory.create(
					{
						users: [{ userId: posterId(), isOwner: 1 }],
						startsAt: hoursFromNow(1),
						visibility: { forAssociation: associationId },
					},
					{
						requests: [
							{ users: [{ userId: bookerId(), isOwner: 1 }], isAccepted: true },
						],
					},
				),
		},
		{
			why: "the lobby limited to it has ended",
			createContent: (associationId) =>
				LobbyFactory.create(
					{
						hostUserId: posterId(),
						visibility: { forAssociation: associationId },
					},
					{ isEnded: true },
				),
		},
		{
			why: "only content limited to another association is upcoming",
			createContent: async () => {
				const otherAssociation = await AssociationFactory.create({
					userId: posterId(),
				});

				return ScrimPostFactory.create({
					users: [{ userId: posterId(), isOwner: 1 }],
					startsAt: hoursFromNow(1),
					visibility: { forAssociation: otherAssociation.id },
				});
			},
		},
	])("deletes when $why", async ({ createContent }) => {
		const association = await AssociationFactory.create({ userId: adminId() });
		await createContent(association.id);

		const isDeleted = await AssociationRepository.deleteById(association.id);

		expect(isDeleted).toBe(true);
		expect(await AssociationRepository.findById(association.id)).toBeNull();
	});
});

describe("insert", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("refuses past the association count limit and keeps no half-made association", async () => {
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: adminId() });
		}

		await expect(
			AssociationRepository.insert({ name: "One too many", userId: adminId() }),
		).rejects.toThrow(LimitReachedError);

		const actual = await AssociationRepository.findAllByMemberUserId(adminId());
		expect(actual).toHaveLength(ASSOCIATION.MAX_COUNT_REGULAR_USER);
		expect(
			await db
				.selectFrom("Association")
				.select("id")
				.where("name", "=", "One too many")
				.executeTakeFirst(),
		).toBeUndefined();
	});
});
