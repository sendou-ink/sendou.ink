import type { Page } from "@playwright/test";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { LFG_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { UserCard } from "../user/user-card";
import { NewLFGPostPage } from "./new-lfg-post-page";

export class LFGPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			addFilterButton: page.getByTestId("add-filter-button"),
			languageFilterSelect: page.getByLabel("Spoken language"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: LFG_PAGE });
	}

	post(text: string) {
		return this.page.getByText(text);
	}

	/** The languages of a post, rendered as one pill e.g. "JA / KO". */
	languagePill(languages: string) {
		return this.page.getByText(languages, { exact: true });
	}

	openUserCard(name: string) {
		return UserCard.open(
			this.page,
			this.page.getByRole("button", { name }).first(),
		);
	}

	async editFirstPost() {
		await this.page.getByRole("link", { name: "Edit" }).first().click();
		return new NewLFGPostPage(this.page);
	}

	async addLanguageFilter() {
		await this.locators.addFilterButton.click();
		await this.page.getByRole("menuitem", { name: "Spoken language" }).click();
	}

	async selectFilterLanguage(code: UnifiedLanguageCode) {
		await this.locators.languageFilterSelect.selectOption(code);
	}
}
