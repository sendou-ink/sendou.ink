import { beforeEach, describe, expect, test } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { joinTeamPage } from "~/features/team/team-urls";
import { invariant } from "~/utils/invariant";
import { wrappedAction } from "~/utils/Test";
import type { updateRosterSchema } from "../team-schemas";
import { action as _joinTeamAction } from "./t.$customUrl.join.server";
import { action as _rosterAction } from "./t.$customUrl.roster.server";

const rosterAction = wrappedAction<typeof updateRosterSchema>({
	action: _rosterAction,
	isJsonSubmission: true,
});
const joinTeamAction = wrappedAction({ action: _joinTeamAction });

const users = UserFactory.pool();
const memberId = () => users.id(1);
const lateJoinerId = () => users.id(2);

describe("roster saving", () => {
	let customUrl: string;

	const teamRow = async () => {
		const team = await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		});
		invariant(team, `No team with the custom url ${customUrl}`);

		return team;
	};

	const memberIds = async () =>
		(await teamRow()).members.map((member) => member.id).sort();

	const rosterAsLoaded = async () => {
		const { members } = await teamRow();

		return {
			loadedMemberIds: members.map((member) => member.id),
			members: members.map((member) => ({
				userId: member.id,
				role: null,
				customRole: null,
				roleType: "PLAYER" as const,
				isManager: Boolean(member.isManager),
			})),
		};
	};

	const join = async (userId: number) => {
		const { inviteCode } = await teamRow();
		invariant(inviteCode, "The team has no invite code");

		await joinTeamAction(
			{},
			{
				user: userId,
				params: { customUrl },
				url: joinTeamPage({ customUrl, inviteCode }),
			},
		);
	};

	beforeEach(async () => {
		await UserFactory.createRegular();
		await users.create(2);

		const team = await TeamFactory.create({
			name: "Team 1",
			memberUserIds: [REGULAR_USER_TEST_ID, memberId()],
		});
		customUrl = team.customUrl;
	});

	test("keeps a member who joined after the roster page was loaded", async () => {
		const loaded = await rosterAsLoaded();
		await join(lateJoinerId());

		await rosterAction(
			{
				_action: "UPDATE_ROSTER",
				loadedMemberIds: loaded.loadedMemberIds,
				members: loaded.members.map((member) =>
					member.userId === memberId()
						? { ...member, role: "FRONTLINE" }
						: member,
				),
			},
			{ user: "regular", params: { customUrl } },
		);

		expect(await memberIds()).toContain(lateJoinerId());
	});

	test("kicks a member removed from the submitted roster", async () => {
		const loaded = await rosterAsLoaded();

		await rosterAction(
			{
				_action: "UPDATE_ROSTER",
				loadedMemberIds: loaded.loadedMemberIds,
				members: loaded.members.filter(
					(member) => member.userId !== memberId(),
				),
			},
			{ user: "regular", params: { customUrl } },
		);

		expect(await memberIds()).not.toContain(memberId());
	});
});
