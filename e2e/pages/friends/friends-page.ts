import type { Locator, Page } from "@playwright/test";
import { sendFriendRequestBaseSchema } from "~/features/friends/friends-schemas";
import { FRIENDS_PAGE } from "~/utils/urls";
import {
	navigate,
	selectUser,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/friends` */
export class FriendsPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, sendFriendRequestBaseSchema);
		this.locators = {
			acceptButton: this.page.getByRole("button", { name: "Accept" }),
			cancelRequestButton: this.page.getByRole("button", { name: "Cancel" }),
			noFriendsText: this.page.getByText("No friends yet"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: FRIENDS_PAGE });
	}

	async sendRequest(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: this.form.getLabel("userId"),
		});
		await submit(this.page);
	}

	/** Accepts the first pending request, the newest one. */
	async acceptRequest() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.acceptButton.first().click(),
		);
	}

	friendButton(name: string) {
		return this.page.getByRole("button", { name });
	}

	friend(name: string) {
		return new FriendMenu(this.page, name);
	}
}

class FriendMenu {
	private readonly page: Page;
	private readonly trigger: Locator;

	constructor(page: Page, name: string) {
		this.page = page;
		this.trigger = page.getByRole("button", { name });
	}

	async deleteFriend() {
		await this.trigger.click();
		await this.page.getByText("Delete friend").click();
		await waitForPOSTResponse(this.page, () =>
			this.page.getByRole("button", { name: "Delete" }).click(),
		);
	}
}
