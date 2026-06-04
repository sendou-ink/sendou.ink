import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { db } from "~/db/sql";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
} from "~/utils/Test";
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
	const teams = await TeamRepository.teamsByMemberUserId(REGULAR_USER_TEST_ID);

	const mainTeam = teams.find((t) => t.isMainTeam);
	const secondaryTeams = teams.filter((t) => !t.isMainTeam);

	return { team: mainTeam, secondaryTeams };
}

describe("Secondary teams", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
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
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		await teamPageAction(
			{ _action: "MAKE_MAIN_TEAM" },
			{ user: "regular", params: { customUrl: "team-2" } },
		);

		const { team } = await loadTeams();

		expect(team!.name).toBe("Team 2");
	});

	it("when deleting the main team, the secondary team becomes main", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		await teamPageAction(
			{
				_action: "DELETE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: "team-1" },
			},
		);

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 2");
		expect(secondaryTeams).toHaveLength(0);
	});

	it("only the team owner (or admin) can delete a team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "admin" });

		await TeamRepository.addNewTeamMember({
			userId: REGULAR_USER_TEST_ID,
			teamId: 1,
			maxTeamsAllowed: 2,
		});

		const response = await teamPageAction(
			{ _action: "DELETE_TEAM" },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		assertResponseErrored(response);

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team).toBeTruthy();
	});

	it("when leaving the main team, the secondary team becomes main", async () => {
		// has to be made by "admin" because can't leave team you own
		await createTeamAction({ name: "Team 1" }, { user: "admin" });
		await createTeamAction({ name: "Team 2" }, { user: "admin" });

		await TeamRepository.addNewTeamMember({
			userId: REGULAR_USER_TEST_ID,
			teamId: 1,
			maxTeamsAllowed: 2,
		});
		await TeamRepository.addNewTeamMember({
			userId: REGULAR_USER_TEST_ID,
			teamId: 2,
			maxTeamsAllowed: 2,
		});

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");

		await teamPageAction(
			{
				_action: "LEAVE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: "team-1" },
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

	const makeUserPatron = () =>
		db
			.updateTable("User")
			.set({ patronTier: 2 })
			.where("id", "=", REGULAR_USER_TEST_ID)
			.execute();

	it("creates more than 2 teams as patron", async () => {
		await makeUserPatron();

		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });
		await createTeamAction({ name: "Team 3" }, { user: "regular" });

		const { secondaryTeams } = await loadTeams();
		expect(secondaryTeams).toHaveLength(2);
	});
});
