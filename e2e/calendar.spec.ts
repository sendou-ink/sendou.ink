import { expect, test } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import {
	expectIsHydrated,
	impersonate,
	isNotVisible,
	navigate,
	seed,
} from "~/utils/playwright";
import { calendarPage } from "~/utils/urls";

const SENDOU_INK_TOURNAMENTS_COUNT = 6;

test.describe("Calendar", () => {
	test("applies filters and operates hidden events toggle", async ({
		page,
	}) => {
		await seed(page);
		await navigate({
			page,
			url: calendarPage(),
		});

		await page.getByTestId("filter-events-button").click();
		await page.getByText("Only events hosted on sendou.ink").click();

		await page.getByText("Apply", { exact: true }).click();

		const tournamentCardLocator = page.getByTestId("tournament-card");
		const hiddenEventsToggleButtonLocator = page.getByTestId(
			"hidden-events-button",
		);

		await expect(tournamentCardLocator).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT,
		);

		await page.reload();
		await expectIsHydrated(page);

		// remembers selection via search params
		await expect(tournamentCardLocator).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT,
		);

		await hiddenEventsToggleButtonLocator.first().click();

		await expect
			.poll(() => tournamentCardLocator.count())
			.toBeGreaterThan(SENDOU_INK_TOURNAMENTS_COUNT);

		const countAfterToggle = await tournamentCardLocator.count();

		await hiddenEventsToggleButtonLocator.first().click();
		await expect
			.poll(() => tournamentCardLocator.count())
			.toBeLessThan(countAfterToggle); // not SENDOU_INK_TOURNAMENTS_COUNT as it's possible we untoggle more than one tournament
	});

	test("sets default filters", async ({ page }) => {
		await seed(page);
		await impersonate(page, NZAP_TEST_ID);
		await navigate({
			page,
			url: calendarPage(),
		});

		const hiddenEventsToggleButtonLocator = page.getByTestId(
			"hidden-events-button",
		);

		await isNotVisible(hiddenEventsToggleButtonLocator);

		await page.getByTestId("filter-events-button").click();
		await page.getByText("Only ranked events").click();

		await page.getByText("Apply & make default", { exact: true }).click();

		await expect(hiddenEventsToggleButtonLocator.first()).toBeVisible();

		await navigate({
			page,
			url: calendarPage(),
		});

		// remembers selection via user preferences
		await expect(hiddenEventsToggleButtonLocator.first()).toBeVisible();
	});

	test("navigates view more buttons", async ({ page }) => {
		await seed(page);
		await navigate({
			page,
			url: calendarPage(),
		});

		await page.getByTestId("calendar-navigate-button").first().click();

		await isNotVisible(page.getByTestId("today-header"));

		await page.getByTestId("calendar-navigate-button").nth(1).click();
		await expect(page.getByTestId("today-header")).toBeVisible();
	});
});
