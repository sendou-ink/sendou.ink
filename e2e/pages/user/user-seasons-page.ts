import type { Page } from "@playwright/test";
import { userSeasonsPage } from "~/features/user-page/user-page-urls";
import { navigate } from "../../helpers/playwright";

/** A user profile's `/seasons` page, including the season summary image export, and its `/seasons/stats` page. */
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

	/** Follows the link to the season's stats page. */
	async openStats() {
		await this.page.getByRole("link", { name: "See all stats" }).click();
	}

	async openStatsTab(
		name: "Overview" | "Weapons" | "Stages" | "Teammates" | "Opponents",
	) {
		await this.page.getByRole("tab", { name }).click();
	}

	/** A weapon of the Weapons tab, labeled with its usage share, e.g. `"Luna Blaster (100%)"`. */
	weaponUsageImage(label: string) {
		return this.page.getByRole("img", { name: label });
	}

	/** A stage & mode win/loss record of the Stages tab, e.g. `"4–0"`. */
	stageRecord(record: string) {
		return this.page.getByText(record, { exact: true });
	}

	/** A player of the Teammates/Opponents tab, linking to their seasons page. */
	playerLink(username: string) {
		return this.page.getByRole("link", { name: username });
	}
}
