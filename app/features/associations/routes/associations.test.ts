import { beforeEach, describe, expect, test } from "vitest";
import * as AssociationFactory from "~/db/seed/factories/AssociationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { SUPPORTER_MIN_PATRON_TIER } from "~/modules/permissions/utils";
import type { SerializeFrom } from "~/utils/remix";
import {
	assertResponseErrored,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import * as AssociationRepository from "../AssociationRepository.server";
import { action } from "../actions/associations.server";
import { ASSOCIATION } from "../associations-constants";
import type { associationsPageActionSchema } from "../associations-schemas";
import { loader } from "../loaders/associations.server";

const associationsAction = wrappedAction<typeof associationsPageActionSchema>({
	action,
});

const associationsLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const users = UserFactory.pool();
const adminId = () => users.id(1);
const memberId = () => users.id(2);
const otherMemberId = () => users.id(3);

describe("Associations page action", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	test("starred member can share the invite link", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);

		const before = await associationsLoader({ user: memberId() });
		expect(before.associations[0]!.inviteCode).toBeUndefined();

		await associationsAction(
			{
				_action: "ADD_MANAGER",
				associationId: association.id,
				userId: memberId(),
			},
			{ user: adminId() },
		);

		const after = await associationsLoader({ user: memberId() });
		expect(after.associations[0]!.inviteCode).toBeTruthy();
	});

	test("unstarring takes the invite link away again", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [memberId()] },
		);

		await associationsAction(
			{
				_action: "REMOVE_MANAGER",
				associationId: association.id,
				userId: memberId(),
			},
			{ user: adminId() },
		);

		const { associations } = await associationsLoader({ user: memberId() });
		expect(associations[0]!.inviteCode).toBeUndefined();
	});

	test("starred member can reset the invite link", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [memberId()] },
		);

		const before = await associationsLoader({ user: memberId() });

		await associationsAction(
			{ _action: "REFRESH_INVITE_CODE", associationId: association.id },
			{ user: memberId() },
		);

		const after = await associationsLoader({ user: memberId() });
		expect(after.associations[0]!.inviteCode).toBeTruthy();
		expect(after.associations[0]!.inviteCode).not.toBe(
			before.associations[0]!.inviteCode,
		);
	});

	test("unstarred member can't reset the invite link", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);

		await expect(
			associationsAction(
				{ _action: "REFRESH_INVITE_CODE", associationId: association.id },
				{ user: memberId() },
			),
		).rejects.toThrow();
	});

	test("starred member can remove an unstarred member", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [memberId()], memberUserIds: [otherMemberId()] },
		);

		await associationsAction(
			{
				_action: "REMOVE_MEMBER",
				associationId: association.id,
				userId: otherMemberId(),
			},
			{ user: memberId() },
		);

		const { associations } = await associationsLoader({ user: memberId() });
		expect(associations[0]!.members!.map((member) => member.id)).not.toContain(
			otherMemberId(),
		);
	});

	test("starred member can't remove another starred member", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [memberId(), otherMemberId()] },
		);

		await expect(
			associationsAction(
				{
					_action: "REMOVE_MEMBER",
					associationId: association.id,
					userId: otherMemberId(),
				},
				{ user: memberId() },
			),
		).rejects.toThrow();
	});

	test("starred member can't remove the admin", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [memberId()] },
		);

		await expect(
			associationsAction(
				{
					_action: "REMOVE_MEMBER",
					associationId: association.id,
					userId: adminId(),
				},
				{ user: memberId() },
			),
		).rejects.toThrow();
	});

	test("admin can't remove themselves", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);

		await expect(
			associationsAction(
				{
					_action: "REMOVE_MEMBER",
					associationId: association.id,
					userId: adminId(),
				},
				{ user: adminId() },
			),
		).rejects.toThrow();
	});

	test("member can't star another member", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId(), otherMemberId()] },
		);

		await expect(
			associationsAction(
				{
					_action: "ADD_MANAGER",
					associationId: association.id,
					userId: otherMemberId(),
				},
				{ user: memberId() },
			),
		).rejects.toThrow();
	});

	test("admin can't leave without a starred member", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ memberUserIds: [memberId()] },
		);

		const response = await associationsAction(
			{ _action: "LEAVE_ASSOCIATION", associationId: association.id },
			{ user: adminId() },
		);

		assertResponseErrored(response, "starred member to take over");
	});

	test("oldest starred member becomes the admin when the admin leaves", async () => {
		const association = await AssociationFactory.create(
			{ userId: adminId() },
			{ managerUserIds: [otherMemberId(), memberId()] },
		);

		await associationsAction(
			{ _action: "LEAVE_ASSOCIATION", associationId: association.id },
			{ user: adminId() },
		);

		const { associations } = await associationsLoader({ user: memberId() });
		expect(associations[0]!.permissions.MANAGE).toEqual([memberId()]);
		expect(associations[0]!.members!.map((member) => member.id)).not.toContain(
			adminId(),
		);
	});

	test("can't join past the association count limit", async () => {
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: memberId() });
		}

		const response = await joinNewAssociation();

		assertResponseErrored(response, "maximum number of associations");
		const { associations } = await associationsLoader({ user: memberId() });
		expect(associations).toHaveLength(ASSOCIATION.MAX_COUNT_REGULAR_USER);
	});

	test("supporter can join past the regular user limit up to the supporter limit", async () => {
		await UserFactory.grant(memberId(), {
			patronTier: SUPPORTER_MIN_PATRON_TIER,
		});
		for (let i = 0; i < ASSOCIATION.MAX_COUNT_REGULAR_USER; i++) {
			await AssociationFactory.create({ userId: memberId() });
		}

		for (
			let i = ASSOCIATION.MAX_COUNT_REGULAR_USER;
			i < ASSOCIATION.MAX_COUNT_SUPPORTER;
			i++
		) {
			await joinNewAssociation();
		}
		const response = await joinNewAssociation();

		assertResponseErrored(response, "maximum number of associations");
		const { associations } = await associationsLoader({ user: memberId() });
		expect(associations).toHaveLength(ASSOCIATION.MAX_COUNT_SUPPORTER);
	});
});

async function joinNewAssociation() {
	const owner = await UserFactory.create();
	const association = await AssociationFactory.create({ userId: owner.id });

	return associationsAction(
		{
			_action: "JOIN_ASSOCIATION",
			inviteCode: await AssociationRepository.findInviteCodeById(
				association.id,
			),
		},
		{ user: memberId() },
	);
}
