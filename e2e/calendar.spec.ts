import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { CalendarNewEventPage } from "./pages/calendar/calendar-new-event-page";
import { CalendarPage } from "./pages/calendar/calendar-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentInfoPage } from "./pages/tournament/tournament-info-page";
import { TournamentRulesPage } from "./pages/tournament/tournament-rules-page";

const SENDOU_INK_TOURNAMENTS_COUNT = 3;
const EXTERNAL_EVENTS_COUNT = 2;

test.describe("Calendar", () => {
	test("applies filters and operates hidden events toggle", async ({
		page,
		factories,
	}) => {
		// all of them at the same time so they share one clock header and its toggle
		const startTimes = [dateToDatabaseTimestamp(new Date())];
		for (let i = 0; i < SENDOU_INK_TOURNAMENTS_COUNT; i++) {
			await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				startTimes,
			});
		}
		for (let i = 0; i < EXTERNAL_EVENTS_COUNT; i++) {
			await factories.CalendarEventFactory.create({
				authorId: ADMIN_ID,
				startTimes,
			});
		}

		const calendar = new CalendarPage(page);
		await calendar.goto();

		const filters = await calendar.openFilters();
		await filters.form.check("isSendou");
		await filters.apply();

		await expect(calendar.locators.tournamentCards).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT,
		);

		await calendar.reload();

		// remembers selection via search params
		await expect(calendar.locators.tournamentCards).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT,
		);

		await calendar.toggleHiddenEvents();

		await expect(calendar.locators.tournamentCards).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT + EXTERNAL_EVENTS_COUNT,
		);

		await calendar.toggleHiddenEvents();

		await expect(calendar.locators.tournamentCards).toHaveCount(
			SENDOU_INK_TOURNAMENTS_COUNT,
		);
	});

	test("sets default filters", async ({ page, factories }) => {
		// not hosted on sendou.ink, so the ranked filter hides it
		await factories.CalendarEventFactory.create({ authorId: ADMIN_ID });

		await impersonate(page, NZAP_TEST_ID);

		const calendar = new CalendarPage(page);
		await calendar.goto();

		await isNotVisible(calendar.locators.hiddenEventsButtons);

		const filters = await calendar.openFilters();
		await filters.form.check("isRanked");
		await filters.applyAndMakeDefault();

		await expect(calendar.locators.hiddenEventsButtons.first()).toBeVisible();

		await calendar.goto();

		// remembers selection via user preferences
		await expect(calendar.locators.hiddenEventsButtons.first()).toBeVisible();
	});

	test("navigates view more buttons", async ({ page }) => {
		const calendar = new CalendarPage(page);
		await calendar.goto();

		await calendar.navigatePrevious();

		await isNotVisible(calendar.locators.todayHeader);

		await calendar.navigateNext();

		await expect(calendar.locators.todayHeader).toBeVisible();
	});

	test("renders clock header times in the browser locale", async ({
		browser,
		workerBaseURL,
		factories,
	}) => {
		await factories.CalendarEventFactory.create({ authorId: ADMIN_ID });

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
			const caCalendar = new CalendarPage(ca.page);
			const gbCalendar = new CalendarPage(gb.page);

			await caCalendar.goto();
			await gbCalendar.goto();

			const caTime = await caCalendar.locators.clockHeaderTimes
				.first()
				.textContent();
			const gbTime = await gbCalendar.locators.clockHeaderTimes
				.first()
				.textContent();

			expect(caTime).toMatch(/AM|PM|a\.m\.|p\.m\./i);
			expect(gbTime).not.toMatch(/AM|PM|a\.m\.|p\.m\./i);
			expect(caTime).not.toBe(gbTime);
		} finally {
			await ca.context.close();
			await gb.context.close();
		}
	});

	test("creates a new calendar event", async ({ page }) => {
		await impersonate(page);

		const newEvent = new CalendarNewEventPage(page);
		await newEvent.goto();

		await newEvent.form.fill("name", "Test Calendar Event");
		await newEvent.setFirstDate(new Date(2027, 0, 15, 17, 0));
		await newEvent.form.fill("bracketUrl", "https://sendou.ink/test-bracket");

		await newEvent.form.submit();

		await expect(page).toHaveURL(/\/calendar\/\d+/);
	});

	test("creates a new tournament with a map pool and follow-up bracket", async ({
		page,
		factories,
	}) => {
		// tournaments can only be added by an organizer, unlike calendar events
		const organizer = await factories.UserFactory.create(null, {
			roles: ["TOURNAMENT_ORGANIZER"],
		});

		await impersonate(page, organizer.id);

		const newTournament = new CalendarNewEventPage(page);
		await newTournament.gotoNewTournament();

		const startTime = new Date(2027, 0, 15, 17, 0);
		const mapPool = [
			{ stage: "Scorch Gorge", mode: "Splat Zones" },
			{ stage: "Eeltail Alley", mode: "Tower Control" },
			{ stage: "Hagglefish Market", mode: "Rainmaker" },
		];

		await newTournament.form.fill("name", "Test Tournament");
		await newTournament.form.fill(
			"description",
			"An automated test tournament",
		);
		await newTournament.setFirstDate(startTime);
		await newTournament.form.fill("discordInviteCode", "test-invite");

		// flip a tournament setting away from its default
		await newTournament.form.check("requireInGameNames");

		// "Picked by TO" allows an arbitrary map pool, unlike the validated tiebreaker modes
		await newTournament.form.select("toToolsMode", "TO");
		await newTournament.pickMapPool(mapPool);

		await newTournament.addFollowUpBracket({
			name: "Underground bracket",
			format: "Single-elimination",
			placements: "-1",
		});

		await newTournament.form.submit();

		await expect(page).toHaveURL(/\/to\/\d+/);
		const tournamentId = Number(page.url().match(/\/to\/(\d+)/)?.[1]);

		// start time round-trips
		const tournamentInfo = new TournamentInfoPage(page);
		await tournamentInfo.goto(tournamentId);
		await expect(tournamentInfo.startTime(startTime).first()).toBeVisible();

		// the follow-up bracket shows up
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournamentId);
		await expect(brackets.bracketTab("Underground")).toBeVisible();

		// the TO map pool round-trips onto the rules page
		const rules = new TournamentRulesPage(page);
		await rules.goto(tournamentId);
		for (const { stage, mode } of mapPool) {
			await expect(rules.stageName(stage)).toBeVisible();
			await expect(rules.modeImage(mode).first()).toBeVisible();
		}
	});
});
