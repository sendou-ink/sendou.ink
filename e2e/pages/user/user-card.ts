import type { Locator, Page } from "@playwright/test";
import { reportUserSchema } from "~/features/user-report/user-report-schemas";
import { expect, submit, waitForPOSTResponse } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { UserCardEditPage } from "./user-card-edit-page";

/** The user card popover, opened by clicking a user's name wherever one is shown. */
export class UserCard {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			banner: page.getByTestId("user-card-banner"),
			editLink: page.getByRole("link", { name: "Edit" }),
			acceptFriendRequestButton: page.getByLabel("Accept friend request"),
			pendingFriendRequestButton: page.getByLabel("Friend request pending"),
			sendFriendRequestButton: page.getByLabel("Send friend request"),
			reportUserButton: page.getByTestId("report-user-button"),
			friendRequestAcceptedToast: page.getByText("Friend request accepted"),
		};
	}

	/** Opens the card popover through its trigger. */
	static async open(page: Page, trigger: Locator) {
		const card = new UserCard(page);
		await trigger.click();
		await expect(card.locators.banner).toBeVisible();
		return card;
	}

	bio(text: string) {
		return this.page.getByText(text);
	}

	async openEditPage() {
		await this.locators.editLink.click();
		return new UserCardEditPage(this.page);
	}

	async acceptFriendRequest() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.acceptFriendRequestButton.click(),
		);
	}

	async openReportDialog() {
		await this.locators.reportUserButton.click();
		return new ReportUserDialog(this.page);
	}
}

class ReportUserDialog {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, reportUserSchema);
		this.locators = {
			matchIdInput: page.getByLabel("Match ID"),
			sentToast: page.getByText("Report sent to the staff"),
		};
	}

	async send() {
		await submit(this.page);
	}
}
