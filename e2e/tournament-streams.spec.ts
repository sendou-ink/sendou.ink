import {
	tournamentAdminPage,
	tournamentBracketsPage,
	tournamentStreamsPage,
} from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	startBracket,
	submit,
	test,
} from "./helpers/playwright";
import {
	backToBracket,
	goToTab,
	navigateToMatch,
	reportResult,
} from "./helpers/tournament-match";

test.describe("Tournament streams", () => {
	test("can set cast twitch accounts in admin", async ({ page }) => {
		const tournamentId = 2;

		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: tournamentAdminPage(tournamentId),
		});

		await page.getByRole("tab", { name: "Stream" }).click();
		await page.getByRole("button", { name: "Add", exact: true }).click();
		await page
			.getByPlaceholder("dappleproductions")
			.nth(0)
			.fill("test_cast_stream");
		await page.getByRole("button", { name: "Add", exact: true }).click();
		await page
			.getByPlaceholder("dappleproductions")
			.nth(1)
			.fill("another_cast");
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

		await page.getByRole("tab", { name: "Stream" }).click();
		await expect(page.getByPlaceholder("dappleproductions").nth(0)).toHaveValue(
			"test_cast_stream",
		);
		await expect(page.getByPlaceholder("dappleproductions").nth(1)).toHaveValue(
			"another_cast",
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
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, setEnds: false });
		await backToBracket(page);

		// The LIVE button should be visible since team 102 members are streaming
		const bracketsViewer = page.getByTestId("brackets-viewer");
		const liveButton = bracketsViewer.getByText("LIVE").first();
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
		await page.getByRole("tab", { name: "Stream" }).click();
		await page.getByRole("button", { name: "Add", exact: true }).click();
		await page.getByPlaceholder("dappleproductions").fill("test_cast_stream");
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
		await goToTab(page, "action");
		await reportResult(page, { mapsToReport: 1, setEnds: false });

		// Set match as casted via chip radio
		await goToTab(page, "admin");
		await page.locator('label[for$="-test_cast_stream"]').click();
		await backToBracket(page);

		// Verify LIVE button appears (multiple may exist from player streams)
		await expect(page.getByText("LIVE").first()).toBeVisible();
	});
});
