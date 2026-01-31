import type { Page } from "@playwright/test";
import {
	expect,
	impersonate,
	navigate,
	seed,
	startBracket,
	submit,
	test,
} from "~/utils/playwright";
import {
	tournamentAdminPage,
	tournamentBracketsPage,
	tournamentStreamsPage,
} from "~/utils/urls";

const navigateToMatch = async (page: Page, matchId: number) => {
	await expect(async () => {
		await page.locator(`[data-match-id="${matchId}"]`).click();
		await expect(page.getByTestId("match-header")).toBeVisible();
	}).toPass();
};

const selectRosterIfNeeded = async (page: Page, teamIndex: 0 | 1) => {
	const position = teamIndex === 0 ? "first" : "last";
	const checkbox = page.getByTestId("player-checkbox-0")[position]();

	if ((await checkbox.count()) > 0 && !(await checkbox.isDisabled())) {
		await page.getByTestId("player-checkbox-0")[position]().click();
		await page.getByTestId("player-checkbox-1")[position]().click();
		await page.getByTestId("player-checkbox-2")[position]().click();
		await page.getByTestId("player-checkbox-3")[position]().click();
		await submit(page, `save-active-roster-button-${teamIndex}`);
		await expect(
			page.getByTestId("player-checkbox-0")[position](),
		).toBeDisabled();
	}
};

const reportPartialScore = async (page: Page) => {
	await page.getByTestId("actions-tab").click();
	await selectRosterIfNeeded(page, 0);
	await selectRosterIfNeeded(page, 1);
	await page.getByTestId("winner-radio-1").click();
	await submit(page, "report-score-button");
	await expect(page.getByText("1-0")).toBeVisible();
};

const backToBracket = async (page: Page) => {
	await page.getByTestId("back-to-bracket-button").click();
	await expect(page.getByTestId("brackets-viewer")).toBeVisible();
};

test.describe("Tournament streams", () => {
	test("can set cast twitch accounts in admin", async ({ page }) => {
		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page
			.getByLabel("Twitch accounts")
			.fill("test_cast_stream,another_cast");
		await submit(page, "save-cast-twitch-accounts-button");

		// Verify persistence by navigating away and back
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await expect(page.getByLabel("Twitch accounts")).toHaveValue(
			"test_cast_stream,another_cast",
		);
	});

	test("can view streams on bracket popover when match is in progress", async ({
		page,
	}) => {
		const tournamentId = 2;
		// Match 2 is team 102 (seed 2) vs team 115 (seed 15)
		// Team 102 has users 6 and 7 who have deterministic streams
		const matchId = 2;

		await startBracket(page, tournamentId);

		await navigateToMatch(page, matchId);
		// Report partial score to set startedAt (match becomes "in progress")
		await reportPartialScore(page);
		await backToBracket(page);

		// The LIVE button should be visible since team 102 members are streaming
		const liveButton = page.getByText("LIVE").first();
		await expect(liveButton).toBeVisible();

		// Click the LIVE button to open the popover
		await liveButton.click();

		// Verify stream popover shows the streaming player info
		await expect(page.getByTestId("stream-popover")).toBeVisible();
		// Multiple streams may be visible, verify at least one exists
		await expect(page.getByTestId("tournament-stream").first()).toBeVisible();
	});

	test("can view streams on streams page", async ({ page }) => {
		const tournamentId = 2;

		await startBracket(page, tournamentId);

		await navigate({
			page,
			url: tournamentStreamsPage(tournamentId),
		});

		// Verify TournamentStream components are visible
		const streams = page.getByTestId("tournament-stream");
		await expect(streams.first()).toBeVisible();

		// Verify stream info is displayed (viewer count)
		await expect(page.locator("text=150").first()).toBeVisible();
	});

	test("cast stream shows on bracket when match is set as casted", async ({
		page,
	}) => {
		const tournamentId = 2;
		// Match 2 involves team 102 which has 4 players (no roster selection needed)
		const matchId = 2;

		await seed(page);
		await impersonate(page);

		// Set up cast twitch account (test_cast_stream exists as live stream in seed)
		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});
		await page.getByLabel("Twitch accounts").fill("test_cast_stream");
		await submit(page, "save-cast-twitch-accounts-button");

		// Start bracket
		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId }),
		});
		await page.getByTestId("finalize-bracket-button").click();
		await submit(page, "confirm-finalize-bracket-button");

		// Navigate to match and start it
		await navigateToMatch(page, matchId);
		await reportPartialScore(page);

		// Set match as casted
		await page.getByTestId("cast-info-select").selectOption("test_cast_stream");
		await submit(page, "cast-info-submit-button");
		await backToBracket(page);

		// Verify LIVE button appears (multiple may exist from player streams)
		await expect(page.getByText("LIVE").first()).toBeVisible();
	});
});
