import { expect, test } from "@playwright/test";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/constants";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import {
	impersonate,
	isNotVisible,
	modalClickConfirmButton,
	navigate,
	seed,
	submit,
} from "~/utils/playwright";
import {
	TEAM_SEARCH_PAGE,
	editTeamPage,
	teamPage,
	userPage,
} from "~/utils/urls";

test.describe("Team search page", () => {
	test("filters teams", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: TEAM_SEARCH_PAGE });

		const searchInput = page.getByTestId("team-search-input");
		const firstTeamName = page.getByTestId("team-0");
		const secondTeamName = page.getByTestId("team-1");

		await expect(firstTeamName).toHaveText("Alliance Rogue");
		await expect(secondTeamName).toBeVisible();

		await searchInput.fill("Alliance Rogue");
		await expect(secondTeamName).not.toBeVisible();

		await firstTeamName.click();
		await expect(page).toHaveURL(/alliance-rogue/);
	});

	test("creates new team", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: "/" });

		await page.getByTestId("anything-adder-menu-button").click();
		await page.getByTestId("menu-item-team").click();

		await expect(page).toHaveURL(/new=true/);
		await page.getByTestId("new-team-name-input").fill("Chimera");
		await submit(page);

		await expect(page).toHaveURL(/chimera/);
	});
});

test.describe("Team page", () => {
	test("edit team info", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("alliance-rogue") });

		await page.getByTestId("edit-team-button").click();

		await page.getByTestId("name-input").clear();
		await page.getByTestId("name-input").fill("Better Alliance Rogue");

		await page.getByLabel("Team Bluesky").clear();
		await page.getByLabel("Team Bluesky").fill("BetterAllianceRogue");

		await page.getByTestId("bio-textarea").clear();
		await page.getByTestId("bio-textarea").fill("shorter bio");

		await page.getByTestId("edit-team-submit-button").click();

		await expect(page).toHaveURL(/better-alliance-rogue/);
		await page.getByText("shorter bio").isVisible();
		await expect(page.getByTestId("bsky-link").first()).toHaveAttribute(
			"href",
			"https://bsky.app/profile/BetterAllianceRogue",
		);
	});

	test("kicks a member & changes a role", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("alliance-rogue") });

		// Owner is Sendou
		await expect(page.getByTestId(`member-owner-${ADMIN_ID}`)).toBeVisible();

		await page.getByTestId("manage-roster-button").click();

		await page.getByTestId("role-select-0").selectOption("SUPPORT");

		await page.getByTestId("member-row-3").isVisible();
		await page.getByTestId("kick-button").last().click();
		await modalClickConfirmButton(page);
		await isNotVisible(page.getByTestId("member-row-3"));

		await navigate({ page, url: teamPage("alliance-rogue") });

		await expect(page.getByTestId("member-row-role-0")).toHaveText("Support");
	});

	test("deletes team", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);

		await navigate({ page, url: TEAM_SEARCH_PAGE });
		const firstTeamName = page.getByTestId("team-0");
		await firstTeamName.click();

		await page.getByTestId("edit-team-button").click();
		await page.getByTestId("delete-team-button").click();
		await modalClickConfirmButton(page);

		await expect(page).toHaveURL(TEAM_SEARCH_PAGE);
		await expect(page.getByTestId("team-0")).not.toHaveText("Alliance Rogue");
	});

	test("resets invite code, joins team, leaves, rejoins", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("alliance-rogue") });

		await page.getByTestId("manage-roster-button").click();

		const oldInviteLink = await page.getByTestId("invite-link").innerText();

		await page.getByTestId("reset-invite-link-button").click();

		await expect(page.getByTestId("invite-link")).not.toHaveText(oldInviteLink);
		const newInviteLink = await page.getByTestId("invite-link").innerText();

		await impersonate(page, NZAP_TEST_ID);

		await navigate({ page, url: newInviteLink });
		await submit(page);

		await page.getByTestId("leave-team-button").click();
		await modalClickConfirmButton(page);

		await navigate({ page, url: newInviteLink });
		await submit(page);

		await page.getByTestId("leave-team-button").isVisible();
	});

	test("joins a secondary team, makes main team & leaves making the seconary team the main one", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("team-olive") });

		await page.getByTestId("manage-roster-button").click();

		const inviteLink = await page.getByTestId("invite-link").innerText();
		await navigate({ page, url: inviteLink });
		await submit(page);

		await submit(page, "make-main-team-button");

		await navigate({ page, url: userPage({ discordId: ADMIN_DISCORD_ID }) });

		await expect(page.getByTestId("secondary-team-trigger")).toBeVisible();
		await isNotVisible(page.getByText("Alliance Rogue"));

		await page.getByTestId("main-team-link").click();

		await page.getByTestId("leave-team-button").click();
		await modalClickConfirmButton(page);

		await navigate({ page, url: userPage({ discordId: ADMIN_DISCORD_ID }) });

		await isNotVisible(page.getByTestId("secondary-team-trigger"));
		await expect(page.getByText("Alliance Rogue")).toBeVisible();
	});

	test("makes another user editor, who can edit the page & becomes owner after the original leaves", async ({
		page,
	}) => {
		await seed(page, "NZAP_IN_TEAM");
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("alliance-rogue") });

		await page.getByTestId("manage-roster-button").click();

		await page.getByTestId("editor-switch").first().click();

		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: editTeamPage("alliance-rogue") });

		await page.getByTestId("bio-textarea").clear();
		await page.getByTestId("bio-textarea").fill("from editor");
		await page.getByTestId("edit-team-submit-button").click();

		await expect(page).toHaveURL(/alliance-rogue/);
		await page.getByText("from editor").isVisible();

		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: teamPage("alliance-rogue") });
		await page.getByTestId("leave-team-button").click();
		await page.getByText("New owner will be N-ZAP").isVisible();
		await modalClickConfirmButton(page);

		await isNotVisible(page.getByTestId("leave-team-button"));
	});
});
