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
		const banLog = page.getByTestId("ban-log");
		this.locators = {
			reportsList,
			reportDetails: reportsList.locator("details"),
			banLog,
			/** Bans and unbans of the user, latest first. */
			banLogEntries: banLog.locator(":scope > div"),
		};
	}

	async goto(userId: number) {
		await navigate({ page: this.page, url: userAdminPage({ id: userId }) });
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
