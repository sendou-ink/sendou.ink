import { beforeEach, describe, expect, test } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action as _teamPageAction } from "../actions/t.$customUrl.index.server";
import { action as teamIndexPageAction } from "../actions/t.new.server";
import * as TeamRepository from "../TeamRepository.server";
import type {
	createTeamSchema,
	teamProfilePageActionSchema,
} from "../team-schemas";
import {
	createTeamOwnedByRegular,
	createTeamWithRegularMember,
} from "../tests/fixtures";

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

describe("Secondary teams", () => {
	beforeEach(async () => {
		await UserFactory.createAdmin();
		await UserFactory.createRegular();
	});

	test("first team created becomes main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams).toHaveLength(0);
	});

	test("second team created becomes secondary", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	test("makes secondary team main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	test("sets main team (2 team)", async () => {
		await createTeamOwnedByRegular("Team 1");
		const secondary = await createTeamOwnedByRegular("Team 2", false);

		await teamPageAction(
			{ _action: "MAKE_MAIN_TEAM" },
			{ user: "regular", params: { customUrl: secondary.customUrl } },
		);

		const { team } = await loadTeams();

		expect(team!.name).toBe("Team 2");
	});

	test("when deleting the main team, the secondary team becomes main", async () => {
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

	test("only the team owner (or admin) can delete a team", async () => {
		const { customUrl } = await createTeamWithRegularMember({ name: "Team 1" });

		await expect(
			teamPageAction(
				{ _action: "DELETE_TEAM" },
				{ user: "regular", params: { customUrl } },
			),
		).rejects.toThrow("Response thrown with status code: 403");

		expect(await TeamRepository.findByCustomUrl(customUrl)).toBeTruthy();
	});

	test("when leaving the main team, the secondary team becomes main", async () => {
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

	test("creates max 2 teams as non-patron", async () => {
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

	test("creates more than 2 teams as patron", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });
		await createTeamAction({ name: "Team 3" }, { user: "regular" });

		const { secondaryTeams } = await loadTeams();
		expect(secondaryTeams).toHaveLength(2);
	});
});
