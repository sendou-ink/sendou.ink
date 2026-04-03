import type { Page } from "@playwright/test";
import {
	clockFormatSchema,
	disableBuildAbilitySortingSchema,
	spoilerFreeModeSchema,
} from "~/features/settings/settings-schemas";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	test,
	waitForPOSTResponse,
} from "~/utils/playwright";
import { createFormHelpers } from "~/utils/playwright-form";
import {
	CALENDAR_PAGE,
	SETTINGS_PAGE,
	tournamentBracketsPage,
	tournamentResultsPage,
} from "~/utils/urls";

test.describe("Settings", () => {
	test("updates 'disableBuildAbilitySorting'", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: "/builds/luna-blaster",
		});

		const oldContents = await page
			.getByTestId("build-card")
			.first()
			.innerHTML();

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		const form = createFormHelpers(page, disableBuildAbilitySortingSchema);
		await form.check("newValue");
		await waitForPOSTResponse(page, () => form.check("newValue"));

		await navigate({
			page,
			url: "/builds/luna-blaster",
		});

		const newContents = await page
			.getByTestId("build-card")
			.first()
			.innerHTML();

		expect(newContents).not.toBe(oldContents);
	});

	test("updates clock format preference", async ({ page }) => {
		await seed(page);
		await impersonate(page);

		await navigate({
			page,
			url: CALENDAR_PAGE,
		});

		const clockHeader = page.locator("[class*='clockHeader']").first();
		const initialTime = await clockHeader.locator("span").first().textContent();

		expect(initialTime).toMatch(/AM|PM/);

		await navigate({
			page,
			url: SETTINGS_PAGE,
		});

		const form = createFormHelpers(page, clockFormatSchema);
		await waitForPOSTResponse(page, () => form.select("newValue", "24h"));

		await navigate({
			page,
			url: CALENDAR_PAGE,
		});

		const newTime = await clockHeader.locator("span").first().textContent();

		expect(newTime).not.toMatch(/AM|PM/);
		expect(newTime).not.toBe(initialTime);
		expect(newTime).toContain(":");
	});
});

const enableSpoilerFreeMode = async (page: Page) => {
	await navigate({ page, url: SETTINGS_PAGE });
	const form = createFormHelpers(page, spoilerFreeModeSchema);
	await waitForPOSTResponse(page, () => form.check("newValue"));
};

test.describe("Spoiler-free mode", () => {
	const FINALIZED_TOURNAMENT_ID = 7;

	test("censors bracket and reveals on click", async ({ page }) => {
		await seed(page, "FINALIZED_BRACKET");
		await impersonate(page);
		await enableSpoilerFreeMode(page);

		await navigate({
			page,
			url: tournamentBracketsPage({ tournamentId: FINALIZED_TOURNAMENT_ID }),
		});

		// bracket is censored — "Show results" button visible
		const showResultsButton = page.getByRole("button", {
			name: "Show results",
		});
		await expect(showResultsButton).toBeVisible();

		// later rounds (SF/Finals) show "???" for team names
		await expect(page.getByText("???").first()).toBeVisible();

		// click "Show results" to reveal
		await showResultsButton.click();

		// after reveal, "Hide results" button appears
		await expect(
			page.getByRole("button", { name: "Hide results" }),
		).toBeVisible();

		// "???" no longer present
		await isNotVisible(page.getByText("???"));

		// navigate to results page — sessionStorage reveal carries over
		await navigate({
			page,
			url: tournamentResultsPage(FINALIZED_TOURNAMENT_ID),
		});
		await expect(page.getByTestId("result-team-name").first()).toBeVisible();
	});

	test("results page is censored and can be revealed", async ({ page }) => {
		await seed(page, "FINALIZED_BRACKET");
		await impersonate(page);
		await enableSpoilerFreeMode(page);

		await navigate({
			page,
			url: tournamentResultsPage(FINALIZED_TOURNAMENT_ID),
		});

		// results are censored
		const showResultsButton = page.getByRole("button", {
			name: "Show results",
		});
		await expect(showResultsButton).toBeVisible();
		await isNotVisible(page.getByTestId("result-team-name"));

		// reveal
		await showResultsButton.click();
		await expect(page.getByTestId("result-team-name").first()).toBeVisible();
	});
});
