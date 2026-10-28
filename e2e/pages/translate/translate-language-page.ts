import type { Page } from "@playwright/test";
import { translateLanguageSearchParams } from "~/features/translate/translate-search-params";
import { translatePage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/translate/:language` */
export class TranslateLanguagePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			entries: this.page.locator("[data-testid^='translation-entry-']"),
			previewButton: this.page.getByTestId("translation-preview-button"),
			downloadButton: this.page.getByTestId("translation-download-button"),
			importInput: this.page.getByTestId("translation-import-input"),
			previewBanner: this.page.getByTestId("translation-preview-banner"),
		};
	}

	async goto(
		language: string,
		params: Partial<{ status: "all" | "drafts"; search: string }> = {},
	) {
		await navigate({
			page: this.page,
			url: translateLanguageSearchParams.href(translatePage(language), params),
		});
	}

	entry(id: string) {
		const entry = this.page.getByTestId(`translation-entry-${id}`);

		return {
			textarea: entry.getByTestId("translation-textarea"),
			issues: entry.getByTestId("translation-issues"),
			saveButton: entry.getByTestId("save-draft-button"),
		};
	}
}
