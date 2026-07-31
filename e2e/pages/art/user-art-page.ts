import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { newArtPage, userArtPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/u/:id/art` */
export class UserArtPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			images: this.page.getByTestId("art-image"),
			pendingApprovalText: this.page.getByText(/pending moderator approval/i),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userArtPage({ discordId }) });
	}

	image(nth: number) {
		return this.locators.images.nth(nth);
	}

	editLink(artId: Tables["Art"]["id"]) {
		return this.page.locator(`a[href="${newArtPage(artId)}"]`);
	}
}
