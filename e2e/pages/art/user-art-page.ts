import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import type { ArtSource } from "~/features/art/art-types";
import { newArtPage, userArtPage } from "~/features/art/art-urls";
import { modalClickConfirmButton, navigate } from "../../helpers/playwright";

const SOURCE_LABELS: Record<ArtSource, string> = {
	ALL: "All",
	"MADE-BY": "Art made by",
	"MADE-OF": "Art made for",
};

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
			tagFilter: this.page.locator("main select"),
			/** The art opened big, over the page. */
			bigArt: this.page.getByRole("dialog"),
		};
	}

	/** Given a source, opens the page showing only the art of it. */
	async goto(userId: number, source?: ArtSource) {
		await navigate({
			page: this.page,
			url: userArtPage({ id: userId }, source),
		});
	}

	image(nth: number) {
		return this.locators.images.nth(nth);
	}

	editLink(artId: Tables["Art"]["id"]) {
		return this.page.locator(`a[href="${newArtPage(artId)}"]`);
	}

	/** Shows the art the user made, the art made of them or both. */
	async showSource(source: ArtSource) {
		await this.page
			.getByRole("radio", { name: SOURCE_LABELS[source], exact: true })
			.check();
	}

	/** Narrows the art down to the art having the tag. */
	async filterByTag(tag: string) {
		await this.locators.tagFilter.selectOption({ value: tag });
	}

	/** Opens the link of an art, which shows the page with the art big over it. */
	async openArtLink(userId: number, artId: Tables["Art"]["id"]) {
		await navigate({
			page: this.page,
			url: userArtPage({ id: userId }, undefined, artId),
		});
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
