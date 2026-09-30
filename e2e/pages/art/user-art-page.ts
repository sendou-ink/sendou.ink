import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { newArtPage, userArtPage } from "~/features/art/art-urls";
import { modalClickConfirmButton, navigate } from "../../helpers/playwright";

/** `/u/:id/art` */
export class UserArtPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			images: this.page.getByTestId("art-image"),
			pendingApprovalText: this.page.getByText(/pending moderator approval/i),
			deleteButton: this.page.getByTestId("delete-art-button"),
			unlinkButton: this.page.getByTestId("unlink-art-button"),
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

	/** Deletes the page owner's own art, only their art having a delete button. */
	async deleteArt() {
		await this.locators.deleteButton.click();
		await modalClickConfirmButton(this.page);
	}

	/** Removes the page owner from art made of them, only it having an unlink button. */
	async unlinkFromArt() {
		await this.locators.unlinkButton.click();
		await modalClickConfirmButton(this.page);
	}
}
