import type { Page } from "@playwright/test";
import { articlePage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/a/:slug`, one article */
export class ArticlePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			byline: page.getByTestId("article-byline"),
		};
	}

	async goto(slug: string) {
		await navigate({ page: this.page, url: articlePage(slug) });
	}

	/** The article's top level headings of the text, the page's own title first. */
	headings(title: string) {
		return this.page
			.getByRole("article")
			.getByRole("heading", { level: 1, name: title, exact: true });
	}

	heading(title: string) {
		return this.headings(title).first();
	}

	authorLink(name: string) {
		return this.locators.byline.getByRole("link", { name, exact: true });
	}

	text(content: string) {
		return this.page.getByRole("article").getByText(content);
	}
}
