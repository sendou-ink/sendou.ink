import type { Page } from "@playwright/test";
import { userSeasonsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** A user profile's `/seasons` page, including the season summary image export. */
export class UserSeasonsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			exportImageButton: page.getByRole("button", { name: "Export image" }),
			exportDialog: page.getByRole("dialog"),
			downloadButton: page.getByRole("button", { name: "Download" }),
			supporterPerkExplanation: page.getByText(/supporter perk/),
		};
	}

	async goto(discordId: string, season?: number) {
		await navigate({
			page: this.page,
			url: userSeasonsPage({ user: { discordId }, season }),
		});
	}

	async openExportDialog() {
		await this.locators.exportImageButton.click();
	}

	exportDialogText(content: string) {
		return this.locators.exportDialog.getByText(content);
	}

	async downloadExportedImage() {
		const downloadPromise = this.page.waitForEvent("download");
		await this.locators.exportDialog
			.getByRole("button", { name: "Download" })
			.click();

		return downloadPromise;
	}
}
