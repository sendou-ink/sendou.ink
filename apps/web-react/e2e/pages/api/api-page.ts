import type { Page } from "@playwright/test";
import type { ApiTokenType } from "~/features/api/api-types";
import { API_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

const HEADINGS: Record<ApiTokenType, string> = {
	read: "Read Token",
	write: "Write Token",
};

/** Where a user with API access generates their tokens. */
export class ApiPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			noAccessMessage: page.getByText("You do not have access to the API"),
			// the revealed token is shown in a popover, rendered outside its section
			tokenInput: page.locator("input[readonly]"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: API_PAGE });
	}

	async generateToken(type: ApiTokenType) {
		await this.section(type)
			.getByRole("button", { name: "Generate Token" })
			.click();
		await this.page.waitForURL(API_PAGE);

		return this.revealToken(type);
	}

	async revealToken(type: ApiTokenType) {
		await this.section(type)
			.getByRole("button", { name: /reveal/i })
			.click();

		return this.locators.tokenInput.inputValue();
	}

	/** Both token sections look the same, only their heading tells them apart. */
	private section(type: ApiTokenType) {
		return this.page
			.locator("div:has(> div > h2)")
			.filter({ hasText: HEADINGS[type] });
	}
}
