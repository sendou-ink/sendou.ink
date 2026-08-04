import { beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action as _teamPageAction } from "../actions/t.$customUrl.index.server";
import { action as teamIndexPageAction } from "../actions/t.new.server";
import * as TeamRepository from "../TeamRepository.server";
import type { createTeamSchema } from "../team-schemas";
import type { teamProfilePageActionSchema } from "../team-schemas.server";

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
	isJsonSubmission: true,
});
const teamPageAction = wrappedAction<typeof teamProfilePageActionSchema>({
	action: _teamPageAction,
	isJsonSubmission: true,
});

async function loadTeams() {
	const teams =
		await TeamRepository.findAllByMemberUserId(REGULAR_USER_TEST_ID);

	const mainTeam = teams.find((t) => t.isMainTeam);
	const secondaryTeams = teams.filter((t) => !t.isMainTeam);

	return { team: mainTeam, secondaryTeams };
}

/** A team the regular user is a member but not the owner of. */
const createTeamWithRegularMember = (
	overrides: Partial<Parameters<typeof TeamFactory.create>[0]> = {},
) =>
	TeamFactory.create({
		memberUserIds: [ADMIN_ID, REGULAR_USER_TEST_ID],
		...overrides,
	});

const createTeamOwnedByRegular = (name: string, isMainTeam = true) =>
	TeamFactory.create({
		name,
		isMainTeam,
		memberUserIds: [REGULAR_USER_TEST_ID],
	});

describe("Secondary teams", () => {
	beforeEach(async () => {
		await UserFactory.createAdmin();
		await UserFactory.createRegular();
	});

	it("first team created becomes main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams).toHaveLength(0);
	});

	it("second team created becomes secondary", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	it("makes secondary team main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	it("sets main team (2 team)", async () => {
		await createTeamOwnedByRegular("Team 1");
		const secondary = await createTeamOwnedByRegular("Team 2", false);

		await teamPageAction(
			{ _action: "MAKE_MAIN_TEAM" },
			{ user: "regular", params: { customUrl: secondary.customUrl } },
		);

		const { team } = await loadTeams();

		expect(team!.name).toBe("Team 2");
	});

	it("when deleting the main team, the secondary team becomes main", async () => {
		const main = await createTeamOwnedByRegular("Team 1");
		await createTeamOwnedByRegular("Team 2", false);

		await teamPageAction(
			{
				_action: "DELETE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: main.customUrl },
			},
		);

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 2");
		expect(secondaryTeams).toHaveLength(0);
	});

	it("only the team owner (or admin) can delete a team", async () => {
		const { customUrl } = await createTeamWithRegularMember({ name: "Team 1" });

		const response = await teamPageAction(
			{ _action: "DELETE_TEAM" },
			{ user: "regular", params: { customUrl } },
		);

		assertResponseErrored(response);

		expect(await TeamRepository.findByCustomUrl(customUrl)).toBeTruthy();
	});

	it("when leaving the main team, the secondary team becomes main", async () => {
		// owned by the admin because you can't leave a team you own
		const main = await createTeamWithRegularMember({ name: "Team 1" });
		await createTeamWithRegularMember({ name: "Team 2", isMainTeam: false });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");

		await teamPageAction(
			{
				_action: "LEAVE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: main.customUrl },
			},
		);

		const { team: newTeam, secondaryTeams: newSecondaryTeams } =
			await loadTeams();

		expect(newTeam!.name).toBe("Team 2");
		expect(newSecondaryTeams).toHaveLength(0);
	});

	it("creates max 2 teams as non-patron", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const response = await createTeamAction(
			{ name: "Team 3" },
			{ user: "regular" },
		);

		assertResponseErrored(response);
	});
});

describe("Secondary teams as patron", () => {
	beforeEach(async () => {
		await UserFactory.createRegular(null, { patronTier: 2 });
	});

	it("creates more than 2 teams as patron", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });
		await createTeamAction({ name: "Team 3" }, { user: "regular" });

		const { secondaryTeams } = await loadTeams();
		expect(secondaryTeams).toHaveLength(2);
	});
});
