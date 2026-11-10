import type { Page } from "@playwright/test";
import { ARTICLES_MAIN_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { ArticlePage } from "./article-page";

/** `/a`, every article from the newest */
export class ArticlesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			titles: page.getByRole("main").getByRole("listitem").getByRole("link"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: ARTICLES_MAIN_PAGE });
	}

	/** Where in the list the article is, the newest being 0. */
	async listPosition(title: string) {
		const titles = await this.locators.titles.allTextContents();
		return titles.indexOf(title);
	}

	/** The list entry of an article: its title, authors and date. */
	article(title: string) {
		return this.page
			.getByRole("main")
			.getByRole("listitem")
			.filter({ has: this.articleLink(title) });
	}

	articleLink(title: string) {
		return this.page.getByRole("link", { name: title, exact: true });
	}

	async openArticle(title: string) {
		await this.articleLink(title).click();
		return new ArticlePage(this.page);
	}
}
