import type { Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	scrimsNewFormSchema,
	submitMapListFormSchema,
} from "~/features/scrims/scrims-schemas";
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

	test("auto-cancels overlapping pending scrims when a scrim is booked", async ({
		page,
	}) => {
		await seed(page, "NO_SCRIMS");
		await impersonate(page);

		const bookedAt = new Date();
		bookedAt.setDate(bookedAt.getDate() + 1);
		bookedAt.setHours(18, 0, 0, 0);

		const overlappingAt = new Date(bookedAt);
		overlappingAt.setMinutes(30); // within ±1h of the booked time

		const farAwayAt = new Date(bookedAt);
		farAwayAt.setHours(22, 0, 0, 0); // outside the ±1h window

		await createScrimPost(page, bookedAt, "Booked post");
		await createScrimPost(page, overlappingAt, "Overlapping post");
		await createScrimPost(page, farAwayAt, "Far away post");

		// NZAP requests the earliest (soon-to-be-booked) post
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: scrimsPage() });
		await page.getByTestId("available-scrims-tab").click();
		await page.getByTestId("request-scrim-button").first().click();
		await selectUser({ labelName: "User 2", page, userName: "5" });
		await selectUser({ labelName: "User 3", page, userName: "6" });
		await selectUser({ labelName: "User 4", page, userName: "7" });
		await submit(page);

		// Author accepts the request, booking the scrim
		await impersonate(page);
		await navigate({ page, url: scrimsPage() });
		await page.getByTestId("confirm-modal-trigger-button").first().click();
		await submit(page, "confirm-button");

		// The overlapping pending post is auto-removed, the far away one survives
		await page.getByRole("tab", { name: /Owned/ }).click();
		await expect(page.getByText("Far away post")).toBeVisible();
		await expect(page.getByText("Overlapping post")).toHaveCount(0);
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

		await page.getByRole("tab", { name: "Action" }).click();
		await expect(page.getByTestId("scrim-map-list-form")).toBeVisible();
	});

	test("map-by-map: lists, report, undo, replay, change list, stats", async ({
		page,
	}) => {
		await seed(page);

		const scrimUrl = scrimPage(1);

		const mapListForm = createFormHelpers(page, submitMapListFormSchema, {
			submitTestId: "submit-map-list-button",
		});

		// ADMIN opens the Action tab — the map list form is shown immediately
		await impersonate(page, ADMIN_ID);
		await navigate({ page, url: scrimUrl });
		await page.getByRole("tab", { name: "Action" }).click();
		await expect(page.getByTestId("scrim-map-list-form")).toBeVisible();

		// ADMIN submits a map list — the post's tournament (Swim or Sink) is the
		// default source for the scrim author's team, so they can submit without
		// running the tournament search. A first map is generated immediately
		// so the page transitions to the report UI with the map-list manager
		// collapsed.
		await waitForPOSTResponse(page, () => mapListForm.submit());
		await expect(page.getByTestId("report-score-button")).toBeVisible();
		await page.getByRole("button", { name: /Manage map lists/i }).click();
		await expect(page.getByTestId("map-list-row-ALPHA")).toContainText(
			"Swim or Sink",
		);

		// NZAP submits a pool-URL-based map list. They have no list yet so the
		// map-list manager is already expanded on mount.
		await impersonate(page, NZAP_TEST_ID);
		await navigate({ page, url: scrimUrl });
		await page.getByRole("tab", { name: "Action" }).click();
		await page.getByLabel("Pool URL").click();
		await mapListForm.fill("serializedPool", TEST_POOL_SERIALIZED);
		await waitForPOSTResponse(page, () => mapListForm.submit());
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
		await page.getByRole("button", { name: /Manage map lists/i }).click();

		// Remove ALPHA's tournament list (trash icon opens a confirm dialog)
		await page
			.getByTestId("map-list-row-ALPHA")
			.getByLabel(/Remove list/i)
			.click();
		await waitForPOSTResponse(page, () => submit(page, "confirm-button"));
		await expect(page.getByTestId("scrim-map-list-form")).toBeVisible();

		// Re-submit ALPHA's list, this time as a pool URL
		await page.getByLabel("Pool URL").click();
		await mapListForm.fill("serializedPool", TEST_POOL_SERIALIZED);
		await waitForPOSTResponse(page, () => mapListForm.submit());
		await expect(page.getByTestId("map-list-row-ALPHA")).toContainText("Pool");

		// Verify stats tab reflects the played maps
		await page.getByRole("tab", { name: "Stats" }).click();
		await expect(page.getByTestId("scrim-stats-root")).toBeVisible();

		// Four reported maps total (Alpha 2 / Bravo 2 from ADMIN's POV).
		// Switch to "Mode" view so each row groups by mode, and disable the
		// pool restriction so maps outside ADMIN's resubmitted pool still count.
		// Sum of wins+losses across rows should equal 4.
		await page
			.getByTestId("scrim-stats-root")
			.getByText("Mode", { exact: true })
			.click();
		await page.getByRole("switch").click({ force: true });

		const statsRoot = page.getByTestId("scrim-stats-root");
		const winCells = await statsRoot
			.locator("tbody tr td:nth-child(2)")
			.allInnerTexts();
		const lossCells = await statsRoot
			.locator("tbody tr td:nth-child(3)")
			.allInnerTexts();
		const total =
			winCells.reduce((acc, v) => acc + Number(v), 0) +
			lossCells.reduce((acc, v) => acc + Number(v), 0);
		expect(total).toBe(4);
	});
});

async function createScrimPost(page: Page, at: Date, text: string) {
	await navigate({ page, url: newScrimPostPage() });

	const form = createFormHelpers(page, scrimsNewFormSchema);

	await form.setDateTime("at", at);
	await form.fill("postText", text);

	await submit(page);
}

async function reportScrimMapWinner(page: Page, winner: "ALPHA" | "BRAVO") {
	const testId = winner === "ALPHA" ? "winner-radio-1" : "winner-radio-2";
	await expect(
		page.locator('[data-testid^="winner-radio-"][data-selected="true"]'),
	).toHaveCount(0);
	await page.getByTestId(testId).click();
	await submit(page, "report-score-button");
}
