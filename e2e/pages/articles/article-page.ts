import type { Page } from "@playwright/test";
import { articlePage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/a/:slug` */
export class ArticlePage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(slug: string) {
		await navigate({ page: this.page, url: articlePage(slug) });
	}

	heading(title: string) {
		// the markdown body repeats the title as its own h1, the page h1 comes first
		return this.page.getByRole("heading", { level: 1, name: title }).first();
	}

	authorLink(name: string) {
		return this.page
			.getByRole("link", { name })
			.and(this.page.locator('[href^="/u/"]'));
	}

	text(content: string) {
		return this.page.getByText(content);
	}
}
