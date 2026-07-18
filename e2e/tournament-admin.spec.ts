import { STAFF_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";
import {
	tournamentAdminPage,
	tournamentAdminRegistrationEditPage,
	tournamentAdminRegistrationPage,
} from "~/utils/urls";
import {
	expect,
	impersonate,
	modalClickConfirmButton,
	navigate,
	seed,
	selectTournament,
	selectUser,
	submit,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";

const TOURNAMENT_ID = 1;
const auditPage = `${tournamentAdminPage(TOURNAMENT_ID)}/audit`;

test.describe("Tournament admin team management", () => {
	test("edits a registration, checks a team in and out, unregisters it and records it in the audit log", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);

		// --- Edit registration: rename the first team ---
		await navigate({
			page,
			url: tournamentAdminRegistrationEditPage(TOURNAMENT_ID, 1),
		});
		await expect(
			page.getByRole("heading", { name: "Edit registration" }),
		).toBeVisible();

		await page.getByLabel("Team name").fill("Renamed Team");
		await submit(page);

		// back on the team list, the rename is reflected
		await expect(page.getByLabel("Search teams")).toBeVisible();
		await expect(
			page.getByTestId("team-name").filter({ hasText: "Renamed Team" }),
		).toBeVisible();

		const firstRowActions = page
			.getByTestId("team-row")
			.first()
			.getByLabel("Actions");

		// --- Check the team in (fetcher JSON submit fired from the menu) ---
		await firstRowActions.click();
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("menuitem", { name: /^Check in/ }).click();
		});

		// --- Check the team out ---
		await firstRowActions.click();
		await waitForPOSTResponse(page, async () => {
			await page.getByRole("menuitem", { name: /^Check out/ }).click();
		});

		// --- Unregister the team (confirm dialog) ---
		await firstRowActions.click();
		await page.getByRole("menuitem", { name: "Unregister" }).click();
		await expect(
			page.getByRole("heading", {
				name: /Unregister .* and delete its registration info\?/,
			}),
		).toBeVisible();
		await modalClickConfirmButton(page);

		// --- Audit log records the actions (target table cells, not the
		// event-filter <option>s that share the same text) ---
		await navigate({ page, url: auditPage });
		await expect(
			page.getByRole("cell", { name: "Team checked in" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "Team checked out" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "Team unregistered" }),
		).toBeVisible();
	});

	test("adds a new team and records it in the audit log", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminRegistrationPage(TOURNAMENT_ID),
		});
		await expect(
			page.getByRole("heading", { name: "Add new team" }),
		).toBeVisible();

		await page.getByLabel("Team name").fill("Panda Squad");
		// "Panda" (the seeded staff user) is not registered in this tournament, so it
		// is a valid roster member; the faker-generated participants all are.
		await selectUser({ page, userName: "Panda", labelName: "Player" });
		await page.getByLabel("Captain").selectOption(String(STAFF_TEST_ID));

		await submit(page);

		await expect(
			page.getByTestId("team-name").filter({ hasText: "Panda Squad" }),
		).toBeVisible();

		await navigate({ page, url: auditPage });
		await expect(
			page.getByRole("cell", { name: "Team registered" }),
		).toBeVisible();
	});

	test("imports a roster from another tournament into the registration form", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminRegistrationPage(TOURNAMENT_ID),
		});
		await expect(
			page.getByRole("heading", { name: "Add new team" }),
		).toBeVisible();

		await page.getByRole("button", { name: "Import team" }).click();
		const dialog = page.getByRole("dialog");
		await expect(
			dialog.getByRole("heading", { name: "Import team" }),
		).toBeVisible();

		// "Paddling Pool 253" is a past tournament with rostered teams in the seed
		await selectTournament({ page, query: "Paddling Pool" });

		// the team <select> populates asynchronously from the import loader and
		// auto-selects the first team
		const teamSelect = dialog.getByLabel("Team", { exact: true });
		await expect(teamSelect.locator("option")).not.toHaveCount(0);

		await dialog.getByTestId("submit-button").click();

		// the dialog closes and the imported roster's name prefills the form. We only
		// assert the prefill: the seed reuses the same users across tournaments, so the
		// imported members already belong to this tournament's teams and the server
		// would reject the registration — the import behaviour itself is what we test.
		await expect(
			page.getByRole("heading", { name: "Import team" }),
		).toHaveCount(0);
		await expect(page.getByLabel("Team name")).not.toHaveValue("");
	});

	test("exports the team list", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: tournamentAdminPage(TOURNAMENT_ID) });

		const teamName = (
			await page.getByTestId("team-name").first().innerText()
		).trim();

		await page.getByRole("button", { name: "Export" }).click();
		await expect(
			page.getByRole("heading", { name: "Export participants" }),
		).toBeVisible();

		const downloadPromise = page.waitForEvent("download");
		await page.getByRole("button", { name: "Download" }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toBe("participants.txt");

		const path = await download.path();
		const fs = await import("node:fs/promises");
		const content = await fs.readFile(path, "utf-8");
		expect(content).toContain(teamName);
	});

	test("filters the team list by name and by captain Discord id", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: tournamentAdminPage(TOURNAMENT_ID) });

		const rows = page.getByTestId("team-row");
		const search = page.getByLabel("Search teams");

		// admin (the impersonated user) captains the first team and is on no other
		// team in this tournament, so its name + discord id both single it out
		const firstTeamName = (
			await page.getByTestId("team-name").first().innerText()
		).trim();

		await search.fill(firstTeamName);
		await expect(rows).toHaveCount(1);
		await expect(page.getByTestId("team-name").first()).toHaveText(
			firstTeamName,
		);

		await search.fill(ADMIN_DISCORD_ID);
		await expect(rows).toHaveCount(1);
		await expect(page.getByTestId("team-name").first()).toHaveText(
			firstTeamName,
		);

		await search.fill("zzz-no-such-team-zzz");
		await expect(
			page.getByText("No registrations match your search"),
		).toBeVisible();
	});
});
