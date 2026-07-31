import type { Page } from "@playwright/test";
import { userAdminPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/u/:identifier/admin` */
export class UserAdminPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		const reportsList = page.getByTestId("user-reports-list");
		this.locators = {
			reportsList,
			reportDetails: reportsList.locator("details"),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userAdminPage({ discordId }) });
	}

	totalReportsText(count: number) {
		return this.page.getByText(`${count} total`);
	}

	text(content: string) {
		return this.page.getByText(content);
	}

	async openFirstReport() {
		await this.locators.reportsList.locator("summary").first().click();
	}
}
