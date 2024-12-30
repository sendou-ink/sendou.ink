import { expect, test } from "@playwright/test";
import { ADMIN_ID } from "~/constants";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import type { TournamentLoaderData } from "~/features/tournament/routes/to.$id";
import type { StageId } from "~/modules/in-game-lists";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import invariant from "~/utils/invariant";
import {
	fetchSendouInk,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	submit,
} from "~/utils/playwright";
import { tournamentBracketsPage, tournamentPage } from "~/utils/urls";

const fetchTournamentLoaderData = () =>
	fetchSendouInk<TournamentLoaderData>(
		"/to/1/admin?_data=features%2Ftournament%2Froutes%2Fto.%24id",
	);

const getIsOwnerOfUser = ({
	data,
	userId,
	teamId,
}: {
	data: TournamentLoaderData;
	userId: number;
	teamId: number;
}) => {
	const team = data.tournament.ctx.teams.find((t) => t.id === teamId);
	invariant(team, "Team not found");

	return team.members.find((m) => m.userId === userId)?.isOwner;
};

const getTeamCheckedInAt = ({
	data,
	teamId,
}: {
	data: TournamentLoaderData;
	teamId: number;
}) => {
	const team = data.tournament.ctx.teams.find((t) => t.id === teamId);
	invariant(team, "Team not found");
	return team.checkIns.length > 0;
};

test.describe("Tournament", () => {
	test("registers for tournament", async ({ page }) => {
		await seed(page, "REG_OPEN");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(1),
		});

		await page.getByTestId("tab-Register").click();

		await page.getByLabel("Pick-up name").fill("Chimera");
		await page.getByTestId("save-team-button").click();

		await page.getByTestId("add-player-button").click();
		await expect(page.getByTestId("member-num-2")).toBeVisible();
		await page.getByTestId("add-player-button").click();
		await expect(page.getByTestId("member-num-3")).toBeVisible();
		await page.getByTestId("add-player-button").click();
		await expect(page.getByTestId("member-num-4")).toBeVisible();

		let stage = 5;
		for (const mode of rankedModesShort) {
			for (let i = 0; i < 2; i++) {
				while (BANNED_MAPS[mode].includes(stage as StageId)) {
					stage++;
				}

				await page.getByTestId(`map-pool-${mode}-${stage}`).click();
				stage++;
			}
		}
		await page.getByTestId("save-map-list-button").click();

		await expect(page.getByTestId("checkmark-icon-num-3")).toBeVisible();
	});

	test("checks in and appears on the bracket", async ({ page }) => {
		await seed(page, "REG_OPEN");
		await impersonate(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId: 3 }),
		});

		await isNotVisible(page.getByText("Chimera"));

		await page.getByTestId("register-tab").click();
		await page.getByTestId("check-in-button").click();

		await page.getByTestId("brackets-tab").click();
		await expect(page.getByTestId("brackets-viewer")).toBeVisible();
		await page.getByText("Chimera").nth(0).waitFor();
	});

	test("operates admin controls", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentPage(1),
		});

		await page.getByTestId("admin-tab").click();

		const actionSelect = page.getByLabel("Action");
		const teamSelect = page.getByLabel("Team", { exact: true });
		const memberSelect = page.getByLabel("Member");

		// Change team name
		{
			await actionSelect.selectOption("CHANGE_TEAM_NAME");
			await teamSelect.selectOption("1");
			await page.getByLabel("Team name").fill("NSTC");
			await submit(page);

			const data = await fetchTournamentLoaderData();
			const firstTeam = data.tournament.ctx.teams.find((t) => t.id === 1);
			invariant(firstTeam, "First team not found");
			expect(firstTeam.name).toBe("NSTC");
		}

		// Change team owner
		let data = await fetchTournamentLoaderData();
		expect(getIsOwnerOfUser({ data, userId: ADMIN_ID, teamId: 1 })).toBe(1);

		await actionSelect.selectOption("CHANGE_TEAM_OWNER");
		await teamSelect.selectOption("1");
		await memberSelect.selectOption("2");
		await submit(page);

		data = await fetchTournamentLoaderData();
		expect(getIsOwnerOfUser({ data, userId: ADMIN_ID, teamId: 1 })).toBe(0);
		expect(getIsOwnerOfUser({ data, userId: NZAP_TEST_ID, teamId: 1 })).toBe(1);

		// Check in team
		expect(getTeamCheckedInAt({ data, teamId: 1 })).toBeFalsy();

		await actionSelect.selectOption("CHECK_IN");
		await submit(page);

		data = await fetchTournamentLoaderData();
		expect(getTeamCheckedInAt({ data, teamId: 1 })).toBeTruthy();

		// Check out team
		await actionSelect.selectOption("CHECK_OUT");
		await submit(page);

		data = await fetchTournamentLoaderData();
		expect(getTeamCheckedInAt({ data, teamId: 1 })).toBeFalsy();

		// Remove member...
		const firstTeam = data.tournament.ctx.teams.find((t) => t.id === 1);
		invariant(firstTeam, "First team not found");
		const firstNonOwnerMember = firstTeam.members.find(
			(m) => m.userId !== 1 && !m.isOwner,
		);
		invariant(firstNonOwnerMember, "First non owner member not found");

		await actionSelect.selectOption("REMOVE_MEMBER");
		await memberSelect.selectOption(String(firstNonOwnerMember.userId));
		await submit(page);

		data = await fetchTournamentLoaderData();
		const firstTeamAgain = data.tournament.ctx.teams.find((t) => t.id === 1);
		invariant(firstTeamAgain, "First team again not found");
		expect(firstTeamAgain.members.length).toBe(firstTeam.members.length - 1);

		// ...and add to another team
		const teamWithSpace = data.tournament.ctx.teams.find(
			(t) => t.id !== 1 && t.members.length === 4,
		);
		invariant(teamWithSpace, "Team with space not found");

		await actionSelect.selectOption("ADD_MEMBER");
		await teamSelect.selectOption(String(teamWithSpace.id));
		await selectUser({
			labelName: "User",
			userName: firstNonOwnerMember.username,
			page,
		});
		await submit(page);

		data = await fetchTournamentLoaderData();
		const teamWithSpaceAgain = data.tournament.ctx.teams.find(
			(t) => t.id === teamWithSpace.id,
		);
		invariant(teamWithSpaceAgain, "Team with space again not found");

		expect(teamWithSpaceAgain.members.length).toBe(
			teamWithSpace.members.length + 1,
		);

		// Remove team
		await actionSelect.selectOption("DELETE_TEAM");
		await teamSelect.selectOption("1");
		await submit(page);

		data = await fetchTournamentLoaderData();
		expect(data.tournament.ctx.teams.find((t) => t.id === 1)).toBeFalsy();
	});

	test("adjusts seeds", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: `${tournamentPage(1)}/seeds`,
		});

		await page.getByTestId("seed-team-1").hover();
		await page.mouse.down();
		// i think the drag & drop library might actually be a bit buggy
		// so we have to do it in steps like this to allow for testing
		await page.mouse.move(0, 500, { steps: 10 });
		await page.mouse.up();

		await submit(page);

		await page.getByTestId("teams-tab").click();
		await expect(page.getByTestId("team-name").first()).not.toHaveText(
			"Chimera",
		);
	});
});
