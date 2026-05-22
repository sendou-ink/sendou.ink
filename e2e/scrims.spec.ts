import type { Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { scrimsNewFormSchema } from "~/features/scrims/scrims-schemas";
import { newScrimPostPage, scrimPage, scrimsPage } from "~/utils/urls";
import {
	expect,
	impersonate,
	navigate,
	seed,
	selectUser,
	submit,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";

const TEST_POOL_SERIALIZED = "sz:3a14000;tc:2c98000";

test.describe("Scrims", () => {
	test("creates a new scrim & deletes it", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: "/",
		});

		await page.getByTestId("anything-adder-menu-button").first().click();
		await page.getByTestId("menu-item-scrimPost").click();

		const form = createFormHelpers(page, scrimsNewFormSchema);

		await page.getByLabel("With").selectOption("PICKUP");
		await selectUser({
			labelName: "User 2",
			page,
			userName: "N-ZAP",
		});
		await selectUser({
			labelName: "User 3",
			page,
			userName: "ab",
		});
		await selectUser({
			labelName: "User 4",
			page,
			userName: "de",
		});
		await page.getByLabel("Visibility").selectOption("2");

		await form.fill("postText", "Test scrim");

		await submit(page);

		await expect(page.getByTestId("limited-visibility-popover")).toBeVisible();

		await page.getByRole("button", { name: "Delete" }).first().click();
		await submit(page, "confirm-button");

		await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(1);
	});

	test("requests an existing scrim post & cancels the request", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		const requestScrimButtonLocator = page.getByTestId("request-scrim-button");

		await page.getByTestId("available-scrims-tab").click();

		await expect(requestScrimButtonLocator.first()).toBeVisible();

		const initialCount = await requestScrimButtonLocator.count();

		await requestScrimButtonLocator.first().click();

		await submit(page);

		await expect(requestScrimButtonLocator).toHaveCount(initialCount - 1);

		const togglePendingRequestsButton = page.getByTestId(
			"toggle-pending-requests-button",
		);

		await togglePendingRequestsButton.first().click();

		await page.getByTestId("view-request-button").first().click();

		const cancelButton = page.getByRole("button", {
			name: "Cancel",
		});
		await cancelButton.click();

		await expect(requestScrimButtonLocator).toHaveCount(initialCount);
	});

	test("accepts a request", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await page.getByTestId("confirm-modal-trigger-button").first().click();
		await submit(page, "confirm-button");

		await page.getByTestId("booked-scrims-tab").click();

		const contactButtonLocator = page.getByRole("link", { name: "Contact" });

		await expect(contactButtonLocator).toHaveCount(2);

		await page.getByRole("link", { name: "Contact" }).first().click();

		await expect(page.getByText("Scheduled scrim")).toBeVisible();
	});

	test("cancels a scrim and shows canceled status", async ({ page }) => {
		await seed(page);
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		// Accept the first available scrim request to make it possible to access the scrim details page
		await page.getByTestId("confirm-modal-trigger-button").first().click();
		await submit(page, "confirm-button");

		await page.getByTestId("booked-scrims-tab").click();

		await page.getByRole("link", { name: "Contact" }).first().click();

		// Cancel the scrim
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.getByLabel("Reason").fill("Oops something came up");
		await submit(page, "cancel-scrim-submit");

		// Go back to the scrims page and check if the scrim is marked as canceled
		await navigate({
			page,
			url: scrimsPage(),
		});
		await expect(page.getByText("Canceled")).toBeVisible();
	});

	test("creates scrim with start time and tournament maps, accepts with time and message", async ({
		page,
	}) => {
		await seed(page, "NO_SCRIMS");
		await impersonate(page);
		await navigate({
			page,
			url: newScrimPostPage(),
		});

		const form = createFormHelpers(page, scrimsNewFormSchema);

		const tomorrowDate = new Date();
		tomorrowDate.setDate(tomorrowDate.getDate() + 1);
		tomorrowDate.setHours(18, 0, 0, 0);

		await form.setDateTime("at", tomorrowDate);

		await form.select("rangeEnd", "+2hours");

		await form.select("maps", "TOURNAMENT");

		const tournamentSearchInput = page.getByTestId("tournament-search-input");
		const tournamentSearchItem = page.getByTestId("tournament-search-item");

		await page.getByRole("button", { name: /Tournament search/i }).click();
		await tournamentSearchInput.fill("Swim or Sink");
		await expect(tournamentSearchItem.first()).toBeVisible();
		await tournamentSearchItem.first().click();

		await submit(page);

		// Log in as NZAP user and request the scrim
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await page.getByTestId("available-scrims-tab").click();

		// Find and click the request button for the scrim we just created
		await page.getByTestId("request-scrim-button").first().click();

		await selectUser({
			labelName: "User 2",
			page,
			userName: "5",
		});
		await selectUser({
			labelName: "User 3",
			page,
			userName: "6",
		});
		await selectUser({
			labelName: "User 4",
			page,
			userName: "7",
		});

		await page.getByLabel("Start time").selectOption({ index: 1 });

		await page.getByLabel("Message").fill("Ready to scrim! Let's do this.");

		await submit(page);

		// Log back in as the author (admin) and verify the scrim and request details
		await impersonate(page, ADMIN_ID);
		await navigate({
			page,
			url: scrimsPage(),
		});

		await expect(page.getByText("+2h")).toBeVisible();
		await expect(page.getByTestId("tournament-popover-trigger")).toBeVisible();

		await expect(
			page.getByText("Ready to scrim! Let's do this."),
		).toBeVisible();

		await page.getByTestId("confirm-modal-trigger-button").click();
		await submit(page, "confirm-button");

		await page.getByTestId("booked-scrims-tab").click();
		await page.getByRole("link", { name: "Contact" }).click();

		await page.getByAltText("Generate maplist").click();

		// on /maps page
		await expect(page.getByText("Create map list")).toBeVisible();
	});

	test("map-by-map: lists, report, undo, replay, change list, stats", async ({
		page,
	}) => {
		await seed(page);

		const scrimUrl = scrimPage(1);

		// ADMIN opens the Action tab — the map list form is shown immediately
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: scrimUrl });
		await page.getByRole("tab", { name: "Action" }).click();
		await expect(page.getByTestId("scrim-map-list-form")).toBeVisible();

		// ADMIN submits a tournament-based map list (Swim or Sink)
		await page.getByTestId("source-radio-tournament").click();
		await page.getByRole("button", { name: /Tournament search/i }).click();
		await page.getByTestId("tournament-search-input").fill("Swim or Sink");
		await expect(
			page.getByTestId("tournament-search-item").first(),
		).toBeVisible();
		await page.getByTestId("tournament-search-item").first().click();
		await submit(page, "submit-map-list-button");
		await expect(page.getByTestId("map-list-row-ALPHA")).toContainText(
			"Tournament",
		);

		// NZAP submits a pool-URL-based map list — the first map is generated
		// immediately and the report UI is shown
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: scrimUrl });
		await page.getByRole("tab", { name: "Action" }).click();
		await page.getByTestId("source-radio-pool").click();
		await page.getByTestId("pool-input").fill(TEST_POOL_SERIALIZED);
		await submit(page, "submit-map-list-button");
		await expect(page.getByTestId("report-score-button")).toBeVisible();
		await expect(page.getByTestId("map-list-row-BRAVO")).toContainText("Pool");

		// Map 1: ALPHA wins → next map auto-generated
		await reportScrimMapWinner(page, "ALPHA");
		await expect(page.getByTestId("report-score-button")).toBeVisible();

		// Map 2: BRAVO wins → next map auto-generated
		await reportScrimMapWinner(page, "BRAVO");
		await expect(page.getByTestId("report-score-button")).toBeVisible();

		// Map 3: ALPHA wins → undo (un-reports map 3, deletes auto-gen map 4)
		await reportScrimMapWinner(page, "ALPHA");
		await expect(page.getByTestId("undo-map-button")).toBeVisible();
		await submit(page, "undo-map-button");
		await expect(page.getByTestId("report-score-button")).toBeVisible();

		// Re-report map 3 as BRAVO wins → next map auto-generated
		await reportScrimMapWinner(page, "BRAVO");

		// Replay last map: replaces the current generated map with a copy of
		// the previous reported one, then report ALPHA wins
		await expect(page.getByTestId("replay-map-button")).toBeVisible();
		await submit(page, "replay-map-button");
		await reportScrimMapWinner(page, "ALPHA");

		// Switch back to ADMIN to change their list
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: scrimUrl });
		await page.getByRole("tab", { name: "Action" }).click();

		// Remove ALPHA's tournament list
		await waitForPOSTResponse(page, async () => {
			await page
				.getByTestId("map-list-row-ALPHA")
				.getByTestId("remove-list-button")
				.click();
		});
		await expect(page.getByTestId("scrim-map-list-form")).toBeVisible();

		// Re-submit ALPHA's list, this time as a pool URL
		await page.getByTestId("source-radio-pool").click();
		await page.getByTestId("pool-input").fill(TEST_POOL_SERIALIZED);
		await submit(page, "submit-map-list-button");
		await expect(page.getByTestId("map-list-row-ALPHA")).toContainText("Pool");

		// Verify stats tab reflects the played maps
		await page.getByRole("tab", { name: "Stats" }).click();
		await expect(page.getByTestId("scrim-stats-root")).toBeVisible();

		// Four reported maps total (Alpha 2 / Bravo 2 from ADMIN's POV).
		// Sum of wins+losses across byMode rows should equal 4.
		const winCells = await page
			.getByTestId("stats-section-byMode")
			.locator("tbody tr td:nth-child(2)")
			.allInnerTexts();
		const lossCells = await page
			.getByTestId("stats-section-byMode")
			.locator("tbody tr td:nth-child(3)")
			.allInnerTexts();
		const total =
			winCells.reduce((acc, v) => acc + Number(v), 0) +
			lossCells.reduce((acc, v) => acc + Number(v), 0);
		expect(total).toBe(4);
	});
});

async function reportScrimMapWinner(page: Page, winner: "ALPHA" | "BRAVO") {
	const testId = winner === "ALPHA" ? "winner-radio-1" : "winner-radio-2";
	await expect(
		page.locator('[data-testid^="winner-radio-"][data-selected="true"]'),
	).toHaveCount(0);
	await page.getByTestId(testId).click();
	await submit(page, "report-score-button");
}
