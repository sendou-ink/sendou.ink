import type { Page } from "@playwright/test";
import {
	clockFormatSchema,
	disableBuildAbilitySortingSchema,
	spoilerFreeModeSchema,
} from "~/features/settings/settings-schemas";
import {
	CALENDAR_PAGE,
	SETTINGS_PAGE,
	tournamentBracketsPage,
	tournamentResultsPage,
} from "~/utils/urls";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	submit,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";

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
			url: `${SETTINGS_PAGE}?tab=preferences`,
		});

		const form = createFormHelpers(page, disableBuildAbilitySortingSchema);
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

		const clockTime = page
			.locator("[class*='clockHeader'] [class*='reserve-one-lb']")
			.first();
		const initialTime = await clockTime.textContent();

		expect(initialTime).toMatch(/AM|PM/);

		await navigate({
			page,
			url: `${SETTINGS_PAGE}?tab=locale`,
		});

		const form = createFormHelpers(page, clockFormatSchema);
		await waitForPOSTResponse(page, () => form.select("newValue", "24h"));

		await navigate({
			page,
			url: CALENDAR_PAGE,
		});

		const newTime = await clockTime.textContent();

		expect(newTime).not.toMatch(/AM|PM/);
		expect(newTime).not.toBe(initialTime);
		expect(newTime).toContain(":");
	});
});

const AVOIDED_MODE_POOL_ERROR =
	"Can't have map pool for a mode that was avoided";

const setModePreference = (
	page: Page,
	mode: string,
	preference: "Avoid" | "Neutral" | "Prefer",
) => {
	const name =
		preference === "Neutral"
			? "Neutral towards the mode"
			: `${preference} the mode`;
	return page
		.getByRole("radiogroup", { name: `Select preference towards ${mode}` })
		.getByRole("radio", { name })
		.click({ force: true });
};

const mapButton = (page: Page, mode: string, stageId: number) =>
	page.getByTestId(`map-pool-${mode}-${stageId}`);

const selectModeTab = (page: Page, mode: string) =>
	page.getByTestId(`map-pool-mode-tab-${mode}`).click();

const SELECTED_MAP_CLASS = /mapButtonGreyedOut/;

// The seeded user already has random map pools, so empty the mode's pool to get
// a known starting state. Only currently selected (greyed, non-banned) stages
// are clickable to deselect.
const clearMapPool = async (page: Page, mode: string) => {
	const picked = page.locator(
		`[data-testid^="map-pool-${mode}-"][class*="mapButtonGreyedOut"]:not([disabled])`,
	);
	for (let count = await picked.count(); count > 0; count--) {
		// the selected-state check icon overlays the button and intercepts clicks
		await picked.first().click({ force: true });
		await expect(picked).toHaveCount(count - 1);
	}
};

test.describe("Match profile map preferences", () => {
	test("retains map selection when toggling a mode prefer -> avoid -> prefer", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: SETTINGS_PAGE });

		await setModePreference(page, "SZ", "Prefer");
		await selectModeTab(page, "SZ");
		await clearMapPool(page, "SZ");
		await mapButton(page, "SZ", 1).click();
		await expect(mapButton(page, "SZ", 1)).toHaveClass(SELECTED_MAP_CLASS);

		// avoiding hides the picker, but the selection should be remembered
		await setModePreference(page, "SZ", "Avoid");
		await isNotVisible(mapButton(page, "SZ", 1));

		await setModePreference(page, "SZ", "Prefer");
		await selectModeTab(page, "SZ");
		await expect(mapButton(page, "SZ", 1)).toHaveClass(SELECTED_MAP_CLASS);
	});

	test("can save 'zones only' after a now-avoided mode previously had a map pool", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: SETTINGS_PAGE });

		// Save a map pool for both SZ and TC (stage 2 is not banned in TC).
		await setModePreference(page, "SZ", "Prefer");
		await selectModeTab(page, "SZ");
		await clearMapPool(page, "SZ");
		await mapButton(page, "SZ", 1).click();
		await setModePreference(page, "TC", "Prefer");
		await selectModeTab(page, "TC");
		await clearMapPool(page, "TC");
		await mapButton(page, "TC", 2).click();
		await submit(page);

		// Switch to "zones only" by avoiding every mode except SZ, then save.
		await setModePreference(page, "TW", "Avoid");
		await setModePreference(page, "TC", "Avoid");
		await setModePreference(page, "RM", "Avoid");
		await setModePreference(page, "CB", "Avoid");
		await submit(page);

		// Reload so the form loads the persisted preferences. The previously saved
		// TC pool must not resurface as an invalid "pool for an avoided mode".
		await navigate({ page, url: SETTINGS_PAGE });

		await submit(page);
		await isNotVisible(page.getByText(AVOIDED_MODE_POOL_ERROR));
	});
});

const enableSpoilerFreeMode = async (page: Page) => {
	await navigate({ page, url: `${SETTINGS_PAGE}?tab=preferences` });
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
