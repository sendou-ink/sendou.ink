import type { Page } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { calendarNewBaseSchema } from "~/features/calendar/calendar-new-schemas";
import {
	CALENDAR_NEW_PAGE,
	calendarEventPage,
	calendarPage,
	calendarReportWinnersPage,
	TOURNAMENT_NEW_PAGE,
	tournamentBracketsPage,
	tournamentInfoPage,
	tournamentRulesPage,
} from "~/utils/urls";
import {
	expect,
	expectIsHydrated,
	impersonate,
	isNotVisible,
	navigate,
	seed,
	selectUser,
	submit,
	test,
} from "./helpers/playwright";
import { createFormHelpers } from "./helpers/playwright-form";

// the `date` datetime inputs use the array item's label ("Date"), not the
// array's own label, so they're driven directly rather than via the form helper
async function fillFirstDate(page: Page, date: Date) {
	const fill = (segment: string, value: string) =>
		page
			.getByRole("spinbutton", { name: new RegExp(`^${segment}, Date`) })
			.first()
			.fill(value);

	const hours = date.getHours();
	await fill("year", String(date.getFullYear()));
	await fill("month", String(date.getMonth() + 1));
	await fill("day", String(date.getDate()));
	await fill("hour", String(hours % 12 || 12));
	await fill("minute", date.getMinutes().toString().padStart(2, "0"));
	await fill("AM/PM", hours >= 12 ? "PM" : "AM");
}

// the TO map pool grid exposes each map as a mode button inside a group labelled
// by its stage name, so a small pool is built by clicking a few of them
async function fillBasicMapPool(
	page: Page,
	maps: Array<{ stage: string; mode: string }>,
) {
	for (const { stage, mode } of maps) {
		await page
			.getByRole("group", { name: stage })
			.getByRole("button", { name: mode })
			.click();
	}
}

// a freshly added bracket is already a follow-up (sources default on), so it only
// needs its name, format and source placements filled in
async function addFollowUpBracket(
	page: Page,
	{
		name,
		format,
		placements,
	}: { name: string; format: string; placements: string },
) {
	await page.getByTestId("add-bracket-button").click();

	await page.getByLabel("Bracket's name").last().fill(name);
	await page.getByLabel("Format").last().selectOption(format);
	await page.getByTestId("placements-input").last().fill(placements);
}

const SENDOU_INK_TOURNAMENTS_COUNT = 6;

/** Seeded past event that is deliberately left without reported results. */
const EVENT_WITHOUT_RESULTS_ID = 1;

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

	test("renders clock header times in the browser locale", async ({
		browser,
		workerBaseURL,
	}) => {
		const openWith = async (locale: string) => {
			const context = await browser.newContext({
				locale,
				baseURL: workerBaseURL,
			});
			const page = await context.newPage();
			return { context, page };
		};

		const ca = await openWith("en-CA");
		const gb = await openWith("en-GB");

		try {
			await seed(ca.page);

			await navigate({ page: ca.page, url: calendarPage() });
			await navigate({ page: gb.page, url: calendarPage() });

			const firstClockText = (page: Page) =>
				page.getByTestId("clock-header-time").first();

			const caTime = await firstClockText(ca.page).textContent();
			const gbTime = await firstClockText(gb.page).textContent();

			expect(caTime).toMatch(/AM|PM|a\.m\.|p\.m\./i);
			expect(gbTime).not.toMatch(/AM|PM|a\.m\.|p\.m\./i);
			expect(caTime).not.toBe(gbTime);
		} finally {
			await ca.context.close();
			await gb.context.close();
		}
	});

	test("creates a new calendar event", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: CALENDAR_NEW_PAGE });

		const form = createFormHelpers(page, calendarNewBaseSchema);

		await form.fill("name", "Test Calendar Event");
		await fillFirstDate(page, new Date(2027, 0, 15, 17, 0));
		await form.fill("bracketUrl", "https://sendou.ink/test-bracket");

		await form.submit();

		await expect(page).toHaveURL(/\/calendar\/\d+/);
	});

	test("creates a new tournament with a map pool and follow-up bracket", async ({
		page,
	}) => {
		await seed(page);
		await impersonate(page);
		await navigate({ page, url: TOURNAMENT_NEW_PAGE });

		const form = createFormHelpers(page, calendarNewBaseSchema);

		const startTime = new Date(2027, 0, 15, 17, 0);
		const mapPool = [
			{ stage: "Scorch Gorge", mode: "Splat Zones" },
			{ stage: "Eeltail Alley", mode: "Tower Control" },
			{ stage: "Hagglefish Market", mode: "Rainmaker" },
		];

		await form.fill("name", "Test Tournament");
		await form.fill("description", "An automated test tournament");
		await fillFirstDate(page, startTime);
		await form.fill("discordInviteCode", "test-invite");

		// flip a tournament setting away from its default
		await form.check("requireInGameNames");

		// "Picked by TO" allows an arbitrary map pool, unlike the validated tiebreaker modes
		await form.select("toToolsMode", "TO");
		await fillBasicMapPool(page, mapPool);

		await addFollowUpBracket(page, {
			name: "Underground bracket",
			format: "Single-elimination",
			placements: "-1",
		});

		await form.submit();

		await expect(page).toHaveURL(/\/to\/\d+/);
		const tournamentId = Number(page.url().match(/\/to\/(\d+)/)?.[1]);

		// start time round-trips (match the machine-readable ISO so it's timezone-agnostic)
		await navigate({ page, url: tournamentInfoPage(tournamentId) });
		await expect(
			page.locator(`time[datetime="${startTime.toISOString()}"]`).first(),
		).toBeVisible();

		// the follow-up bracket shows up (the tab label drops the "bracket" suffix)
		await navigate({ page, url: tournamentBracketsPage({ tournamentId }) });
		await expect(page.getByRole("tab", { name: "Underground" })).toBeVisible();

		// the TO map pool round-trips onto the rules page
		await navigate({ page, url: tournamentRulesPage(tournamentId) });
		for (const { stage, mode } of mapPool) {
			await expect(page.getByText(stage, { exact: true })).toBeVisible();
			await expect(page.getByAltText(mode).first()).toBeVisible();
		}
	});

	test("reports winners of a past event", async ({ page }) => {
		await seed(page);
		await impersonate(page);
		await navigate({
			page,
			url: calendarReportWinnersPage(EVENT_WITHOUT_RESULTS_ID),
		});

		await page.getByLabel("Participant count").fill("50");
		await page.getByLabel("Team name").fill("Team Olive");
		await page.getByLabel("Placing").fill("1");

		// a team without any players can't be reported
		await page.getByTestId("submit-button").click();
		await expect(
			page.getByText("Each team must have at least one player."),
		).toBeVisible();

		await selectUser({ page, userName: "N-ZAP", labelName: "Player 1" });
		// a player without a sendou.ink account is reported as plain text instead
		await page.getByRole("button", { name: "Add as text" }).nth(1).click();
		await page.getByLabel("Player 2").fill("Player Without Account");

		await submit(page);

		await expect(page).toHaveURL(calendarEventPage(EVENT_WITHOUT_RESULTS_ID));
		await expect(page.getByText("Team Olive")).toBeVisible();
		await expect(page.getByText("Player Without Account")).toBeVisible();

		// reported results are loaded back into the form for editing
		await navigate({
			page,
			url: calendarReportWinnersPage(EVENT_WITHOUT_RESULTS_ID),
		});

		await expect(page.getByLabel("Participant count")).toHaveValue("50");
		await expect(page.getByLabel("Team name")).toHaveValue("Team Olive");
		await expect(page.getByLabel("Placing")).toHaveValue("1");
		await expect(page.getByLabel("Player 1")).toContainText("N-ZAP");
		await expect(page.getByLabel("Player 2")).toHaveValue(
			"Player Without Account",
		);
	});
});
