import type { Page } from "@playwright/test";
import { userVodsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/u/:identifier/vods` */
export class UserVodsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userVodsPage({ discordId }) });
	}

	vodTitle(title: string) {
		return this.page.getByRole("heading", { name: title });
	}
}
