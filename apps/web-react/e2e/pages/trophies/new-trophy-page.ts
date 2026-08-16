import type { Page } from "@playwright/test";
import { NEW_TROPHY_PAGE } from "~/utils/urls";
import {
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** `/trophies/new` */
export class NewTrophyPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			nameInput: page.getByLabel("Name").first(),
			modelInput: page.getByLabel("3D model state"),
			agreeToTermsButton: page.getByRole("button", {
				name: "I have read and agree",
			}),
			pendingTab: page.getByRole("tab", { name: "Pending" }),
			reviewedTab: page.getByRole("tab", { name: "Reviewed" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: NEW_TROPHY_PAGE });
	}

	/** The submission form is behind a one-off agreement to the trophy terms. */
	agreeToTerms() {
		return this.locators.agreeToTermsButton.click();
	}

	async fillForm({
		name,
		organizationName,
		model,
	}: {
		name: string;
		organizationName: string;
		model: string;
	}) {
		await this.locators.nameInput.fill(name);

		await this.page.getByRole("button", { name: /organization/i }).click();
		await this.page
			.getByTestId("organization-search-input")
			.fill(organizationName);
		await this.page.getByTestId("organization-search-item").first().click();

		await this.locators.modelInput.fill(model);
	}

	save() {
		return submit(this.page);
	}

	async openPending() {
		await this.locators.pendingTab.click();
		return new PendingTrophyList(this.page);
	}

	async openReviewed() {
		await this.locators.reviewedTab.click();
		return new PendingTrophyList(this.page);
	}
}

/** The pending/reviewed submission lists of `/trophies/new`. */
class PendingTrophyList {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	row(trophyName: string) {
		return this.page
			.getByTestId("pending-trophy")
			.filter({ hasText: trophyName });
	}

	approve(trophyName: string) {
		return waitForPOSTResponse(this.page, () =>
			this.row(trophyName).getByRole("button", { name: "Approve" }).click(),
		);
	}

	async decline(trophyName: string, reason: string) {
		await this.row(trophyName).getByRole("button", { name: "Decline" }).click();

		const dialog = this.page.getByRole("dialog");
		await dialog.locator("textarea").fill(reason);

		await waitForPOSTResponse(this.page, () =>
			dialog.getByRole("button", { name: "Decline" }).click(),
		);
	}
}
