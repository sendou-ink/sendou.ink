import type { Page } from "@playwright/test";
import { ARTICLES_MAIN_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { ArticlePage } from "./article-page";

/** `/a` */
export class ArticlesPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: ARTICLES_MAIN_PAGE });
	}

	articleLink(title: string) {
		return this.page.getByRole("link", { name: title });
	}

	async openArticle(title: string) {
		await this.articleLink(title).click();
		return new ArticlePage(this.page);
	}
}
