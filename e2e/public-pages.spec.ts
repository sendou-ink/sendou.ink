import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, expectNoErrorPage, test } from "./helpers/playwright";
import { ArticlesPage } from "./pages/articles/articles-page";
import { BuildsPage } from "./pages/builds/builds-page";
import { WeaponBuildsPage } from "./pages/builds/weapon-builds-page";
import { CalendarPage } from "./pages/calendar/calendar-page";
import { FrontPage } from "./pages/front-page/front-page";
import { ContributionsPage } from "./pages/info/contributions-page";
import { FaqPage } from "./pages/info/faq-page";
import { LinksPage } from "./pages/info/links-page";
import { SupportPage } from "./pages/info/support-page";
import { ErrorPage } from "./pages/layout/error-page";
import { ScannerPage } from "./pages/scanner/scanner-page";
import { TournamentPage } from "./pages/tournament/tournament-page";
import { UserPage } from "./pages/user/user-page";

const PUBLIC_USER = {
	discordId: "123456789012345678",
	discordName: "Chirpy",
};
const BUILD_WEAPON_ID = 40;
const EVENT_NAME = "Ink Clash Open";
const TOURNAMENT_NAME = "Public Pages Cup";
const ICS_EVENT_NAME = "ICS Feed Cup";

const ARTICLE = {
	slug: "results-from-riptide-2025",
	title: "Results from Riptide 2025",
	author: "YELLOW",
};

test.describe("Public pages", () => {
	test("renders public pages for a logged-out visitor", async ({
		page,
		factories,
	}) => {
		const user = await factories.UserFactory.create({
			discordId: PUBLIC_USER.discordId,
			discordName: PUBLIC_USER.discordName,
		});
		await factories.BuildFactory.create({
			ownerId: user.id,
			weaponSplIds: [BUILD_WEAPON_ID],
		});
		const startTimes = [dateToDatabaseTimestamp(new Date())];
		await factories.CalendarEventFactory.create({
			authorId: ADMIN_ID,
			name: EVENT_NAME,
			startTimes,
		});
		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: TOURNAMENT_NAME,
			startTimes,
		});

		const front = new FrontPage(page);
		await front.goto();
		await expectNoErrorPage(page);
		await expect(front.locators.welcomeBanner).toBeVisible();

		const userPage = new UserPage(page);
		await userPage.goto(PUBLIC_USER.discordId);
		await expectNoErrorPage(page);
		await expect(
			userPage.usernameHeading(PUBLIC_USER.discordName),
		).toBeVisible();

		const builds = new BuildsPage(page);
		await builds.goto();
		await expectNoErrorPage(page);
		await builds.weaponLink(BUILD_WEAPON_ID).click();
		const weaponBuilds = new WeaponBuildsPage(page);
		await expect(weaponBuilds.locators.buildCards).toHaveCount(1);

		const calendar = new CalendarPage(page);
		await calendar.goto();
		await expectNoErrorPage(page);
		await expect(calendar.tournamentCard(EVENT_NAME)).toBeVisible();
		await expect(calendar.tournamentCard(TOURNAMENT_NAME)).toBeVisible();

		const tournamentPage = new TournamentPage(page);
		await tournamentPage.goto(tournament.id);
		await expectNoErrorPage(page);
		await expect(tournamentPage.heading(TOURNAMENT_NAME)).toBeVisible();

		const faq = new FaqPage(page);
		await faq.goto();
		await expectNoErrorPage(page);
		await expect(faq.question("What is the Plus Server?")).toBeVisible();

		const support = new SupportPage(page);
		await support.goto();
		await expectNoErrorPage(page);
		await expect(support.locators.patreonLink).toBeVisible();
		await expect(support.perk("Ad-free browsing")).toBeVisible();

		const contributions = new ContributionsPage(page);
		await contributions.goto();
		await expectNoErrorPage(page);
		await expect(contributions.contributor("hfcRed")).toBeVisible();

		const links = new LinksPage(page);
		await links.goto();
		await expectNoErrorPage(page);
		await expect(links.resourceLink("Inkipedia")).toBeVisible();

		// scanner is not publicly enabled in the test env: the route renders and
		// sends a logged-out visitor to the front page instead of erroring
		const scanner = new ScannerPage(page);
		await scanner.goto();
		await expectNoErrorPage(page);
		await expect(page).toHaveURL("/");
	});

	test("lists articles and renders one by slug", async ({ page }) => {
		const articles = new ArticlesPage(page);
		await articles.goto();
		await expectNoErrorPage(page);

		const article = await articles.openArticle(ARTICLE.title);
		await expect(article.heading(ARTICLE.title)).toBeVisible();
		await expect(article.authorLink(ARTICLE.author)).toBeVisible();

		await article.goto(ARTICLE.slug);
		await expect(article.heading(ARTICLE.title)).toBeVisible();
		await expect(
			article.text("largest North American Splatoon LAN in history"),
		).toBeVisible();
	});

	test("redirects moved URLs, renders 404 for unknown ones and serves the calendar feed", async ({
		page,
		factories,
	}) => {
		await factories.CalendarEventFactory.create({
			authorId: ADMIN_ID,
			name: ICS_EVENT_NAME,
			startTimes: [dateToDatabaseTimestamp(new Date())],
		});

		const errorPage = new ErrorPage(page);
		await errorPage.goto("/u");
		await expect(page).toHaveURL("/?search=open&type=users");
		await expect(errorPage.locators.root).toHaveCount(0);

		await errorPage.goto("/this-page-does-not-exist");
		await expect(errorPage.locators.root).toBeVisible();
		await expect(errorPage.locators.notFoundHeading).toBeVisible();
		expect(await errorPage.responseStatus("/this-page-does-not-exist")).toBe(
			404,
		);

		const calendar = new CalendarPage(page);
		const feed = await calendar.fetchICalFeed();
		expect(feed.status).toBe(200);
		expect(feed.body).toContain("BEGIN:VCALENDAR");
		expect(feed.body).toContain(ICS_EVENT_NAME);
	});
});
