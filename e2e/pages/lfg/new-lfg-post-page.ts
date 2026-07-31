import type { Page } from "@playwright/test";
import { lfgNewSchema } from "~/features/lfg/lfg-schemas";
import { lfgNewPostPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewLFGPostPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, lfgNewSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: lfgNewPostPage() });
	}

	/** The language checkboxes are labeled by their own name e.g. "日本語". */
	checkLanguage(name: string) {
		return this.page.getByLabel(name).check();
	}

	uncheckLanguage(name: string) {
		return this.page.getByLabel(name).uncheck();
	}

	async save() {
		await submit(this.page);
	}
}
