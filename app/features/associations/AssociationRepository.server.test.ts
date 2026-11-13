import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { LimitReachedError } from "~/utils/errors";
import * as AssociationRepository from "./AssociationRepository.server";
import { ASSOCIATION } from "./associations-constants";

const users = UserFactory.pool();
const adminId = () => users.id(1);
const managerId = () => users.id(2);
const memberId = () => users.id(3);

describe("findById", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("the admin manages, the admin and starred members share the invite link", async () => {
		const { id } = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [managerId()], memberUserIds: [memberId()] },
		);

		const association = await AssociationRepository.findById(id, {
			withMembers: true,
		});

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

		const association = await AssociationRepository.findById(id, {
			withMembers: true,
		});
		const removerIdsOf = (userId: number) =>
			association?.members?.find((member) => member.id === userId)?.permissions
				.REMOVE;

		expect(removerIdsOf(adminId())).toEqual([]);
		expect(removerIdsOf(managerId())).toEqual([adminId()]);
		expect(removerIdsOf(memberId())).toEqual([adminId(), managerId()]);
	});

	test("returns null for an unknown id", async () => {
		expect(await AssociationRepository.findById(9999)).toBeNull();
	});
});

describe("findByMemberUserId", () => {
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

		const result = await AssociationRepository.findByMemberUserId(memberId());

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

		const association = await AssociationRepository.findById(id, {
			withMembers: true,
		});

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

		const { actual } = await AssociationRepository.findByMemberUserId(
			adminId(),
		);
		expect(actual).toHaveLength(ASSOCIATION.MAX_COUNT_REGULAR_USER);
	});

	test("lets a supporter past the regular limit", async () => {
		await UserFactory.grant(adminId(), { patronTier: 2 });
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: adminId() });
		}

		await AssociationRepository.insert({ name: "One more", userId: adminId() });

		const { actual } = await AssociationRepository.findByMemberUserId(
			adminId(),
		);
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

		const association = await AssociationRepository.findById(id, {
			withMembers: true,
		});
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

		const association = await AssociationRepository.findById(id, {
			withMembers: true,
		});
		expect(association?.members).toEqual([
			expect.objectContaining({ id: adminId(), role: "ADMIN" }),
		]);
	});
});

describe("deleteById", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("the association is gone from its members' list", async () => {
		const { id } = await AssociationFactory.create({ userId: adminId() });

		await AssociationRepository.deleteById(id);

		const { actual } = await AssociationRepository.findByMemberUserId(
			adminId(),
		);
		expect(actual).toEqual([]);
	});
});
