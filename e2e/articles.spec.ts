import { expect, setTimezoneCookie, test } from "./helpers/playwright";
import { ArticlePage } from "./pages/articles/article-page";
import { ArticlesPage } from "./pages/articles/articles-page";
import { ErrorPage } from "./pages/layout/error-page";

// the articles are the markdown files of content/articles, no setup needed

const RIPTIDE_SLUG = "results-from-riptide-2025";
const RIPTIDE_TITLE = "Results from Riptide 2025";
const RIPTIDE_DATE = "9/13/2025";
const NEWER_THAN_RIPTIDE_TITLE = "20XX Series 6 Recap";
const SEASON_8_RECAP_TITLE = "SendouQ Season 8 Finale Recap";
const GUIDEBOOK_SLUG = "competitive-guidebook-part-1";
const BELGIAN_CHAMPIONSHIP_SLUG = "belgian-championship-2023";
const WAVING_GOODBYE_SLUG =
	"waving-goodbye-the-start-of-splatoons-great-retirement";
const WAVING_GOODBYE_TITLE =
	'Waving Goodbye: The Start of Splatoon\'s "Great Retirement"';
const WEST_OF_UTC_TIMEZONE = "Pacific/Honolulu";

test.describe("Articles", () => {
	/** `/a` lists the 100 newest articles, the newest first, each with who wrote it and when. */
	test.describe("Listing", () => {
		test("lists the newest articles first", async ({ page }) => {
			const articles = new ArticlesPage(page);
			await articles.goto();

			await expect(
				articles.articleLink(NEWER_THAN_RIPTIDE_TITLE),
			).toBeVisible();
			const newerPosition = await articles.listPosition(
				NEWER_THAN_RIPTIDE_TITLE,
			);
			const riptidePosition = await articles.listPosition(RIPTIDE_TITLE);

			expect(newerPosition).toBeLessThan(riptidePosition);
		});

		test("shows each article's authors and date", async ({ page }) => {
			const articles = new ArticlesPage(page);
			await articles.goto();

			await expect(articles.article(SEASON_8_RECAP_TITLE)).toContainText(
				"by Ckk, Fern, & Samino",
			);
			await expect(articles.article(SEASON_8_RECAP_TITLE)).toContainText(
				"9/4/2025",
			);
		});

		test("opening an article leads to its page", async ({ page }) => {
			const articles = new ArticlesPage(page);
			await articles.goto();

			const article = await articles.openArticle(RIPTIDE_TITLE);

			await expect(page).toHaveURL(`/a/${RIPTIDE_SLUG}`);
			await expect(article.heading(RIPTIDE_TITLE)).toBeVisible();
		});
	});

	/**
	 * An article's page shows its title, authors and date above the markdown text. Authors with a
	 * sendou.ink link lead to their user page.
	 */
	test.describe("Reading", () => {
		test("shows the title, authors and date above the text", async ({
			page,
		}) => {
			const article = new ArticlePage(page);
			await article.goto(RIPTIDE_SLUG);

			await expect(article.heading(RIPTIDE_TITLE)).toBeVisible();
			await expect(article.locators.byline).toHaveText(
				`by YELLOW • ${RIPTIDE_DATE}`,
			);
			await expect(
				article.text("largest North American Splatoon LAN in history"),
			).toBeVisible();
		});

		test("links authors to their sendou.ink user page", async ({ page }) => {
			const article = new ArticlePage(page);
			await article.goto(GUIDEBOOK_SLUG);

			await expect(article.locators.byline).toContainText("by Samino & Radha");
			await expect(article.authorLink("Samino")).toHaveAttribute(
				"href",
				"/u/samino",
			);
			await expect(article.authorLink("Radha")).toHaveAttribute(
				"href",
				"/u/wiper",
			);
		});

		test("shows an author without a link as plain text", async ({ page }) => {
			const article = new ArticlePage(page);
			await article.goto(BELGIAN_CHAMPIONSHIP_SLUG);

			await expect(article.locators.byline).toContainText(
				"by 공주 Alice & Chilliboi",
			);
			await expect(article.locators.byline.getByRole("link")).toHaveCount(0);
		});

		/** The title isn't shown twice when the text starts with it as a heading. */
		test("doesn't repeat the title the text starts with", async ({ page }) => {
			const article = new ArticlePage(page);
			await article.goto(WAVING_GOODBYE_SLUG);

			await expect(article.headings(WAVING_GOODBYE_TITLE)).toHaveCount(1);
		});

		test("an unknown slug is not found", async ({ page }) => {
			const errorPage = new ErrorPage(page);
			await errorPage.goto("/a/no-such-article");

			await expect(errorPage.locators.notFoundHeading).toBeVisible();
		});
	});

	/** An article's date is a calendar day, shown as the same day in every time zone. */
	test.describe("Dates", () => {
		test.use({ timezoneId: WEST_OF_UTC_TIMEZONE });

		test("shows the article's day west of UTC too", async ({ page }) => {
			await setTimezoneCookie(page, WEST_OF_UTC_TIMEZONE);

			const articles = new ArticlesPage(page);
			await articles.goto();
			await expect(articles.article(RIPTIDE_TITLE)).toContainText(RIPTIDE_DATE);

			const article = await articles.openArticle(RIPTIDE_TITLE);
			await expect(article.locators.byline).toContainText(RIPTIDE_DATE);
		});
	});
});
