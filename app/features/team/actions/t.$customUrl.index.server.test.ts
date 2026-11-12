import { beforeEach, describe, expect, test } from "vitest";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { invariant } from "~/utils/invariant";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import type { teamProfilePageActionSchema } from "../team-schemas";
import { action as _teamIndexAction } from "./t.$customUrl.index.server";

const teamIndexAction = wrappedAction<typeof teamProfilePageActionSchema>({
	action: _teamIndexAction,
});

const users = UserFactory.pool();
const ownerId = () => users.id(1);
const managerId = () => users.id(2);
const memberId = () => users.id(3);
const outsiderId = () => users.id(4);

describe("TRANSFER_OWNERSHIP", () => {
	let customUrl: string;

	const ownerOfTeam = async () => {
		const team = await TeamRepository.findByCustomUrl(customUrl);
		invariant(team, `No team with the custom url ${customUrl}`);

		return team.members.find((member) => member.isOwner)?.id;
	};

	const transfer = (actorId: number, newOwnerUserId: number) =>
		teamIndexAction(
			{ _action: "TRANSFER_OWNERSHIP", newOwnerUserId },
			{ user: actorId, params: { customUrl } },
		);

	beforeEach(async () => {
		await users.create(4);

		const team = await TeamFactory.create(
			{ memberUserIds: [ownerId(), managerId(), memberId()] },
			{ managerUserIds: [managerId()] },
		);
		customUrl = team.customUrl;
	});

	test("the owner can hand the team to another member", async () => {
		await transfer(ownerId(), memberId());

		expect(await ownerOfTeam()).toBe(memberId());
	});

	test.each([
		{ why: "a manager", actor: managerId, target: memberId },
		{ why: "the owner to themselves", actor: ownerId, target: ownerId },
		{ why: "the owner to a non-member", actor: ownerId, target: outsiderId },
	])("rejects a transfer by $why", async ({ actor, target }) => {
		const response = await transfer(actor(), target());

		assertResponseErrored(response as Response);
		expect(await ownerOfTeam()).toBe(ownerId());
	});
});
